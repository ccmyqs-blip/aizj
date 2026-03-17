import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateChunksFromDocument } from "@/lib/document-ingest";
import { embedTextWithBothModels } from "@/lib/embedding";

export const runtime = "nodejs";

const MAX_EMBEDDING_CHUNKS = Number(process.env.EMBEDDING_MAX_CHUNKS_PER_DOC ?? 60);
const EMBEDDING_CONCURRENCY = Number(process.env.EMBEDDING_CONCURRENCY ?? 2);
const allowedExtSet = new Set([".pdf", ".doc", ".docx"]);

type CreatedChunk = {
  id: string;
  chunkText: string;
};

function sanitizeBaseName(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
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

export async function POST(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ message: "未登录或会话失效" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  const fileValue = formData.get("file");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ message: "请上传文件" }, { status: 400 });
  }

  if (fileValue.size <= 0) {
    return NextResponse.json({ message: "文件不能为空" }, { status: 400 });
  }

  const originalName = fileValue.name || "uploaded-file";
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedExtSet.has(ext)) {
    return NextResponse.json({ message: "仅支持 PDF、DOC、DOCX 文件" }, { status: 400 });
  }

  const titleInput = String(formData.get("title") ?? "").trim();
  const categoryInput = String(formData.get("category") ?? "").trim();
  const codeInput = String(formData.get("code") ?? "").trim();

  const title = titleInput || sanitizeBaseName(originalName) || "上传文档";
  const category = categoryInput || "UPLOADED";
  const code = codeInput || `UP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const version = "v1";

  const uploadDir = path.join(process.cwd(), "public", "uploads", "documents");
  await fs.mkdir(uploadDir, { recursive: true });

  const safeBaseName = sanitizeBaseName(originalName) || "document";
  const fileName = `${Date.now()}-${randomUUID()}-${safeBaseName}${ext}`;
  const filePath = path.join(uploadDir, fileName);
  const publicPath = `/uploads/documents/${fileName}`;

  try {
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const generatedChunks = await generateChunksFromDocument(filePath);

    const document = await prisma.document.upsert({
      where: {
        code_version: {
          code,
          version
        }
      },
      create: {
        title,
        code,
        category,
        source: publicPath,
        version,
        publishDate: new Date(),
        status: "ACTIVE"
      },
      update: {
        title,
        category,
        source: publicPath,
        publishDate: new Date(),
        status: "ACTIVE"
      },
      select: {
        id: true,
        title: true,
        code: true,
        category: true,
        source: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    await prisma.documentChunk.deleteMany({
      where: {
        documentId: document.id
      }
    });

    const createdChunks: CreatedChunk[] = [];
    for (const chunk of generatedChunks) {
      const created = await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          chapterTitle: chunk.chapterTitle,
          sectionTitle: chunk.sectionTitle,
          chunkText: chunk.chunkText,
          pageNumber: chunk.pageNumber,
          keywords: chunk.keywords,
          sortOrder: chunk.sortOrder
        },
        select: {
          id: true,
          chunkText: true
        }
      });
      createdChunks.push(created);
    }

    const chunksForEmbedding = createdChunks.slice(0, Math.max(0, MAX_EMBEDDING_CHUNKS));

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

    const modelSet = Array.from(new Set(embeddingRows.map((item) => item.model)));

    return NextResponse.json({
      message: "上传并入库成功",
      document: {
        ...document,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString()
      },
      ingest: {
        chunkCount: createdChunks.length,
        embeddedChunkCount: chunksForEmbedding.length,
        embeddingRowCount: embeddingRows.length,
        embeddingModels: modelSet
      },
      meta: {
        fileName: originalName,
        fileSize: fileValue.size,
        uploaderIp: getClientIp(request)
      }
    });
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);

    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "编号重复，请修改后重试" }, { status: 409 });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "上传失败，请稍后重试"
      },
      { status: 500 }
    );
  }
}
