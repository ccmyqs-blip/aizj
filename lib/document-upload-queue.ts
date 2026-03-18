import { prisma } from "@/lib/prisma";
import {
  extractAndChunkDocument,
  toDocumentIngestError,
  validateIngestQuality
} from "@/lib/document-ingest";
import { DocumentIngestError } from "@/lib/document-ingest-types";
import { embedTextWithBothModels } from "@/lib/embedding";

export type DocumentIngestJobInput = {
  documentId: string;
  filePath: string;
  fileName: string;
};

const MAX_EMBEDDING_CHUNKS = Number(process.env.EMBEDDING_MAX_CHUNKS_PER_DOC ?? 60);
const EMBEDDING_CONCURRENCY = Number(process.env.EMBEDDING_CONCURRENCY ?? 2);
const UPLOAD_WORKER_CONCURRENCY = Math.max(1, Number(process.env.UPLOAD_WORKER_CONCURRENCY ?? 1));
const MAX_JOB_ATTEMPTS = Math.max(1, Number(process.env.INGEST_JOB_MAX_ATTEMPTS ?? 2));

let workerInitialized = false;
let activeWorkers = 0;
let scheduling = false;

async function initializeWorkerOnce() {
  if (workerInitialized) {
    return;
  }

  workerInitialized = true;

  await prisma.documentIngestJob
    .updateMany({
      where: {
        status: "RUNNING"
      },
      data: {
        status: "PENDING",
        startedAt: null,
        finishedAt: null,
        error: "worker restarted before completion"
      }
    })
    .catch(() => undefined);
}

async function mapWithConcurrency<T, R>(
  list: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  if (list.length === 0) {
    return [];
  }

  const size = Math.max(1, Math.min(concurrency, list.length));
  const results: R[] = new Array(list.length) as R[];
  let cursor = 0;

  const run = async () => {
    while (cursor < list.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(list[current], current);
    }
  };

  await Promise.all(Array.from({ length: size }, () => run()));
  return results;
}

async function claimNextPendingJob() {
  const next = await prisma.documentIngestJob.findFirst({
    where: {
      status: "PENDING"
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  if (!next) {
    return null;
  }

  const claimed = await prisma.documentIngestJob.updateMany({
    where: {
      id: next.id,
      status: "PENDING"
    },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      error: null,
      attempt: {
        increment: 1
      }
    }
  });

  if (claimed.count === 0) {
    return null;
  }

  return prisma.documentIngestJob.findUnique({
    where: {
      id: next.id
    }
  });
}

async function completeJob(jobId: string) {
  await prisma.documentIngestJob.update({
    where: {
      id: jobId
    },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      error: null
    }
  });
}

async function failOrRetryJob(input: {
  jobId: string;
  attempt: number;
  code: string;
  message: string;
}) {
  const retriableCodes = new Set(["OCR_TIMEOUT", "UNKNOWN"]);

  if (input.attempt < MAX_JOB_ATTEMPTS && retriableCodes.has(input.code)) {
    await prisma.documentIngestJob.update({
      where: {
        id: input.jobId
      },
      data: {
        status: "PENDING",
        startedAt: null,
        finishedAt: null,
        error: `${input.code}: ${input.message}`
      }
    });
    return;
  }

  await prisma.documentIngestJob.update({
    where: {
      id: input.jobId
    },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      error: `${input.code}: ${input.message}`
    }
  });
}

async function processClaimedJob(job: {
  id: string;
  documentId: string;
  filePath: string;
  fileName: string;
  attempt: number;
}) {
  const startedAt = Date.now();
  console.info(`[upload-queue] start job=${job.id} attempt=${job.attempt} document=${job.documentId} file=${job.fileName}`);

  try {
    const document = await prisma.document.findUnique({
      where: {
        id: job.documentId
      },
      select: {
        id: true,
        title: true,
        code: true,
        source: true
      }
    });

    if (!document) {
      throw new DocumentIngestError("PARSE_ERROR", "文档不存在");
    }

    await prisma.document.update({
      where: {
        id: document.id
      },
      data: {
        status: "PROCESSING",
        ingestStage: "EXTRACTING",
        ingestError: null,
        lastIngestAt: new Date()
      }
    });

    const extracted = await extractAndChunkDocument(job.filePath);

    const quality = validateIngestQuality({
      title: document.title,
      code: document.code,
      source: document.source,
      chunks: extracted.chunks,
      textCoverage: extracted.textCoverage
    });

    if (!quality.ok) {
      throw new DocumentIngestError(quality.code, quality.message);
    }

    await prisma.document.update({
      where: {
        id: document.id
      },
      data: {
        ingestStage: "CHUNKING",
        textCoverage: extracted.textCoverage,
        pageCount: extracted.pageCount,
        parsedPageCount: extracted.parsedPageCount,
        ocrUsed: extracted.ocrUsed
      }
    });

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({
        where: {
          documentId: document.id
        }
      });

      await tx.documentChunk.createMany({
        data: extracted.chunks.map((chunk) => ({
          documentId: document.id,
          chapterTitle: chunk.chapterTitle,
          sectionTitle: chunk.sectionTitle,
          chunkText: chunk.chunkText,
          pageNumber: chunk.pageNumber,
          keywords: chunk.keywords || null,
          sortOrder: chunk.sortOrder
        }))
      });
    });

    await prisma.document.update({
      where: {
        id: document.id
      },
      data: {
        ingestStage: "EMBEDDING"
      }
    });

    const chunksForEmbedding = await prisma.documentChunk.findMany({
      where: {
        documentId: document.id
      },
      orderBy: {
        sortOrder: "asc"
      },
      take: Math.max(0, MAX_EMBEDDING_CHUNKS),
      select: {
        id: true,
        chunkText: true
      }
    });

    const embeddingResults = await mapWithConcurrency(
      chunksForEmbedding,
      async (chunk) => {
        const vectors = await embedTextWithBothModels(chunk.chunkText);
        return {
          chunkId: chunk.id,
          vectors
        };
      },
      EMBEDDING_CONCURRENCY
    );

    const embeddingRows = embeddingResults.flatMap((item) =>
      item.vectors.map((vectorItem) => ({
        chunkId: item.chunkId,
        model: vectorItem.model,
        vector: JSON.stringify(vectorItem.vector),
        dimensions: vectorItem.vector.length
      }))
    );

    if (embeddingRows.length > 0) {
      await prisma.documentChunkEmbedding.createMany({
        data: embeddingRows
      });
    }

    await prisma.document.update({
      where: {
        id: document.id
      },
      data: {
        status: "ACTIVE",
        ingestStage: "COMPLETED",
        ingestError: null,
        textCoverage: extracted.textCoverage,
        pageCount: extracted.pageCount,
        parsedPageCount: extracted.parsedPageCount,
        ocrUsed: extracted.ocrUsed,
        lastIngestAt: new Date(),
        publishDate: new Date()
      }
    });

    await completeJob(job.id);

    console.info(
      `[upload-queue] completed job=${job.id} document=${job.documentId} chunks=${extracted.chunks.length} embeddings=${embeddingRows.length} cost=${Date.now() - startedAt}ms`
    );
  } catch (error) {
    const normalized = toDocumentIngestError(error);
    console.error(`[upload-queue] failed job=${job.id} document=${job.documentId}`, normalized);

    await prisma.document
      .update({
        where: {
          id: job.documentId
        },
        data: {
          status: "FAILED",
          ingestStage: "FAILED",
          ingestError: `${normalized.code}: ${normalized.message}`,
          lastIngestAt: new Date()
        }
      })
      .catch(() => undefined);

    await failOrRetryJob({
      jobId: job.id,
      attempt: job.attempt,
      code: normalized.code,
      message: normalized.message
    }).catch(() => undefined);
  } finally {
    activeWorkers = Math.max(0, activeWorkers - 1);
    void scheduleWorkers();
  }
}

async function scheduleWorkers() {
  if (scheduling) {
    return;
  }

  scheduling = true;

  try {
    while (activeWorkers < UPLOAD_WORKER_CONCURRENCY) {
      const next = await claimNextPendingJob();
      if (!next) {
        break;
      }

      activeWorkers += 1;
      void processClaimedJob({
        id: next.id,
        documentId: next.documentId,
        filePath: next.filePath,
        fileName: next.fileName,
        attempt: next.attempt
      });
    }
  } finally {
    scheduling = false;
  }
}

export async function startDocumentIngestWorker() {
  await initializeWorkerOnce();
  await scheduleWorkers();
}

export async function enqueueDocumentIngest(job: DocumentIngestJobInput) {
  await initializeWorkerOnce();

  await prisma.$transaction(async (tx) => {
    await tx.documentIngestJob.updateMany({
      where: {
        documentId: job.documentId,
        status: {
          in: ["PENDING", "RUNNING"]
        }
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: "superseded by new upload"
      }
    });

    await tx.document.update({
      where: {
        id: job.documentId
      },
      data: {
        status: "PROCESSING",
        ingestStage: "EXTRACTING",
        ingestError: null,
        lastIngestAt: new Date()
      }
    });

    await tx.documentIngestJob.create({
      data: {
        documentId: job.documentId,
        filePath: job.filePath,
        fileName: job.fileName,
        status: "PENDING",
        attempt: 0
      }
    });
  });

  await scheduleWorkers();
}

void startDocumentIngestWorker().catch((error) => {
  console.error("[upload-queue] worker startup failed", error);
});
