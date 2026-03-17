import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DOCUMENT_STATUSES } from "../lib/constants/status";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const prisma = new PrismaClient({
  log: ["warn", "error"]
});

const chunkSchema = z.object({
  chapterTitle: z.string().trim().min(1).optional().nullable(),
  sectionTitle: z.string().trim().min(1).optional().nullable(),
  chunkText: z.string().trim().min(1),
  pageNumber: z.number().int().positive().optional().nullable(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  sortOrder: z.number().int().positive().optional()
});

const documentSchema = z.object({
  title: z.string().trim().min(1),
  code: z.string().trim().min(1),
  category: z.string().trim().min(1),
  source: z.string().trim().min(1).optional().nullable(),
  version: z.string().trim().min(1).optional().default("v1"),
  publishDate: z.string().trim().min(1).optional().nullable(),
  status: z.enum(DOCUMENT_STATUSES).optional().default("ACTIVE"),
  chunks: z.array(chunkSchema).default([])
});

const payloadSchema = z.object({
  documents: z.array(documentSchema).min(1)
});

type ImportDocument = z.infer<typeof documentSchema>;

function normalizeNullableText(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePublishDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`无效的 publishDate: ${value}`);
  }
  return parsed;
}

function normalizeKeywords(keywords?: string[]): string[] {
  if (!keywords || keywords.length === 0) {
    return [];
  }

  const normalized = keywords
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return Array.from(new Set(normalized));
}

async function upsertDocumentWithChunks(document: ImportDocument) {
  const publishDate = parsePublishDate(document.publishDate);

  const existingByCodeAndVersion = await prisma.document.findUnique({
    where: {
      code_version: {
        code: document.code,
        version: document.version
      }
    },
    select: { id: true, version: true }
  });

  const existingByCode =
    existingByCodeAndVersion ??
    (await prisma.document.findFirst({
      where: { code: document.code },
      orderBy: { updatedAt: "desc" },
      select: { id: true, version: true }
    }));

  const documentData = {
    title: document.title,
    code: document.code,
    category: document.category,
    source: normalizeNullableText(document.source),
    version: existingByCode ? existingByCode.version : document.version,
    publishDate,
    status: document.status
  };

  const normalizedChunks = document.chunks.map((chunk, index) => ({
    chapterTitle: normalizeNullableText(chunk.chapterTitle),
    sectionTitle: normalizeNullableText(chunk.sectionTitle),
    chunkText: chunk.chunkText,
    pageNumber: chunk.pageNumber ?? null,
    keywords: normalizeKeywords(chunk.keywords).join(","),
    sortOrder: chunk.sortOrder ?? index + 1
  }));

  const result = await prisma.$transaction(async (tx) => {
    const targetDocument = existingByCode
      ? await tx.document.update({
          where: { id: existingByCode.id },
          data: documentData,
          select: { id: true, code: true }
        })
      : await tx.document.create({
          data: documentData,
          select: { id: true, code: true }
        });

    await tx.documentChunk.deleteMany({
      where: { documentId: targetDocument.id }
    });

    if (normalizedChunks.length > 0) {
      await tx.documentChunk.createMany({
        data: normalizedChunks.map((chunk) => ({
          documentId: targetDocument.id,
          chapterTitle: chunk.chapterTitle,
          sectionTitle: chunk.sectionTitle,
          chunkText: chunk.chunkText,
          pageNumber: chunk.pageNumber,
          keywords: chunk.keywords || null,
          sortOrder: chunk.sortOrder
        }))
      });
    }

    return {
      code: targetDocument.code,
      updated: Boolean(existingByCode),
      chunkCount: normalizedChunks.length
    };
  });

  return result;
}

async function main() {
  const inputPathArg = process.argv[2] ?? "data/sample-docs.json";
  const inputPath = path.isAbsolute(inputPathArg)
    ? inputPathArg
    : path.resolve(process.cwd(), inputPathArg);

  console.log(`[import-docs] 使用数据文件: ${inputPath}`);

  const raw = await readFile(inputPath, "utf-8");
  const payload = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`JSON 结构校验失败:\n${parsed.error.message}`);
  }

  let createdCount = 0;
  let updatedCount = 0;
  let chunkCount = 0;

  for (const document of parsed.data.documents) {
    const result = await upsertDocumentWithChunks(document);
    if (result.updated) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }
    chunkCount += result.chunkCount;

    console.log(
      `[import-docs] ${result.updated ? "更新" : "新建"}文档 ${result.code}，已导入条款 ${result.chunkCount} 条`
    );
  }

  console.log(
    `[import-docs] 完成。文档新建 ${createdCount}，文档更新 ${updatedCount}，条款总数 ${chunkCount}`
  );
}

main()
  .catch((error) => {
    console.error("[import-docs] 导入失败:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
