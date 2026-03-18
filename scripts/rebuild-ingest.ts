import { PrismaClient } from "@prisma/client";
import { access } from "node:fs/promises";
import {
  getAbsoluteStoragePathBySource,
  getFileNameFromDocumentSource,
  isUploadedDocumentSource
} from "../lib/document-storage";
import { startDocumentIngestWorker } from "../lib/document-upload-queue";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const prisma = new PrismaClient({
  log: ["warn", "error"]
});

const WAIT_MODE = process.argv.includes("--wait");
const WAIT_TIMEOUT_MS = Number(process.env.INGEST_REBUILD_WAIT_TIMEOUT_MS ?? 30 * 60 * 1000);
const WAIT_INTERVAL_MS = Number(process.env.INGEST_REBUILD_WAIT_INTERVAL_MS ?? 3000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function printReport() {
  const [statusRows, failedRows] = await Promise.all([
    prisma.document.groupBy({
      by: ["status"],
      where: {
        source: {
          startsWith: "/uploads/documents/"
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.document.findMany({
      where: {
        source: {
          startsWith: "/uploads/documents/"
        },
        status: "FAILED"
      },
      select: {
        ingestError: true
      },
      take: 500
    })
  ]);

  const failureCounter = new Map<string, number>();
  for (const row of failedRows) {
    const reason = (row.ingestError ?? "UNKNOWN").split(":")[0] || "UNKNOWN";
    failureCounter.set(reason, (failureCounter.get(reason) ?? 0) + 1);
  }

  const failureTop = Array.from(failureCounter.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  console.log("\n[rebuild-ingest] 回补状态：");
  for (const row of statusRows) {
    console.log(`- ${row.status}: ${row._count._all}`);
  }

  console.log("\n[rebuild-ingest] 失败原因 TopN：");
  if (failureTop.length === 0) {
    console.log("- 无");
  } else {
    for (const [reason, count] of failureTop) {
      console.log(`- ${reason}: ${count}`);
    }
  }
}

async function main() {
  const allUploadedDocs = await prisma.document.findMany({
    where: {
      source: {
        startsWith: "/uploads/documents/"
      }
    },
    select: {
      id: true,
      title: true,
      code: true,
      source: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (allUploadedDocs.length === 0) {
    console.log("[rebuild-ingest] 未找到上传文档，无需重建。");
    return;
  }

  console.log(`[rebuild-ingest] 目标文档数: ${allUploadedDocs.length}`);

  let missingFileCount = 0;
  let enqueuedCount = 0;

  await prisma.$transaction(async (tx) => {
    await tx.document.updateMany({
      where: {
        id: {
          in: allUploadedDocs.map((item) => item.id)
        }
      },
      data: {
        status: "PROCESSING",
        ingestStage: "EXTRACTING",
        ingestError: null,
        textCoverage: 0,
        pageCount: 0,
        parsedPageCount: 0,
        ocrUsed: false,
        lastIngestAt: new Date()
      }
    });

    await tx.documentIngestJob.updateMany({
      where: {
        documentId: {
          in: allUploadedDocs.map((item) => item.id)
        },
        status: {
          in: ["PENDING", "RUNNING"]
        }
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: "superseded by full rebuild"
      }
    });
  });

  for (const doc of allUploadedDocs) {
    if (!isUploadedDocumentSource(doc.source)) {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: "FAILED",
          ingestStage: "FAILED",
          ingestError: "MISSING_FIELDS: source is not upload path"
        }
      });
      missingFileCount += 1;
      continue;
    }

    const filePath = getAbsoluteStoragePathBySource(doc.source);
    const fileName = getFileNameFromDocumentSource(doc.source);
    if (!filePath || !fileName || !(await fileExists(filePath))) {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: "FAILED",
          ingestStage: "FAILED",
          ingestError: "PARSE_ERROR: source file not found"
        }
      });
      missingFileCount += 1;
      continue;
    }

    await prisma.documentIngestJob.create({
      data: {
        documentId: doc.id,
        status: "PENDING",
        attempt: 0,
        filePath,
        fileName
      }
    });

    enqueuedCount += 1;
  }

  console.log(`[rebuild-ingest] 已入队: ${enqueuedCount}，缺失文件: ${missingFileCount}`);

  await startDocumentIngestWorker();

  if (WAIT_MODE && enqueuedCount > 0) {
    console.log("[rebuild-ingest] 等待任务完成...");
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
      const pending = await prisma.documentIngestJob.count({
        where: {
          status: {
            in: ["PENDING", "RUNNING"]
          }
        }
      });

      if (pending === 0) {
        break;
      }

      console.log(`[rebuild-ingest] 仍有任务处理中: ${pending}`);
      await sleep(WAIT_INTERVAL_MS);
    }
  }

  await printReport();
}

main()
  .catch((error) => {
    console.error("[rebuild-ingest] 执行失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

