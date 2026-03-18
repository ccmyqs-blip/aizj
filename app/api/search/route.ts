import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSnippet, normalizeKeywords } from "@/lib/search-utils";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const keyword = (searchParams.get("q") ?? "").trim();
  const category = (searchParams.get("category") ?? "").trim();
  const page = parsePositiveInt(searchParams.get("page"), DEFAULT_PAGE);
  const requestedPageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  const keywords = normalizeKeywords(keyword);
  const uploadedDocumentScope = {
    document: {
      source: {
        startsWith: "/uploads/documents/"
      }
    }
  };

  const andConditions: Array<Record<string, unknown>> = [];
  andConditions.push(uploadedDocumentScope);

  if (category && category !== "all") {
    andConditions.push({
      document: {
        category
      }
    });
  }

  keywords.forEach((token) => {
    andConditions.push({
      OR: [
        { chunkText: { contains: token } },
        { chapterTitle: { contains: token } },
        { sectionTitle: { contains: token } },
        { document: { title: { contains: token } } },
        { document: { code: { contains: token } } }
      ]
    });
  });

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const [total, chunks, categoryRows] = await prisma.$transaction([
    prisma.documentChunk.count({ where }),
    prisma.documentChunk.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ document: { publishDate: "desc" } }, { sortOrder: "asc" }],
      select: {
        id: true,
        chapterTitle: true,
        sectionTitle: true,
        chunkText: true,
        pageNumber: true,
        sortOrder: true,
        document: {
          select: {
            id: true,
            title: true,
            code: true,
            category: true,
            publishDate: true
          }
        }
      }
    }),
    prisma.document.findMany({
      where: {
        source: {
          startsWith: "/uploads/documents/"
        }
      },
      select: {
        category: true
      },
      distinct: ["category"],
      orderBy: {
        category: "asc"
      }
    })
  ]);

  const results = chunks.map((chunk) => ({
    chunkId: chunk.id,
    documentId: chunk.document.id,
    title: chunk.document.title,
    code: chunk.document.code,
    category: chunk.document.category,
    chapterTitle: chunk.chapterTitle ?? "",
    sectionTitle: chunk.sectionTitle ?? "",
    pageNumber: chunk.pageNumber ?? null,
    sortOrder: chunk.sortOrder,
    publishDate: chunk.document.publishDate?.toISOString() ?? null,
    snippet: buildSnippet(chunk.chunkText, keywords)
  }));

  return NextResponse.json({
    keyword,
    category: category || "all",
    page,
    pageSize,
    total,
    categories: categoryRows.map((row) => row.category),
    results
  });
}
