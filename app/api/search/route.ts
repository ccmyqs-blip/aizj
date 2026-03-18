import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSnippet, normalizeKeywords } from "@/lib/search-utils";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;
const MIN_QUALITY_TEXT_COVERAGE = Number(process.env.RETRIEVER_MIN_TEXT_COVERAGE ?? 0.2);

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
      status: "ACTIVE",
      ingestStage: "COMPLETED",
      textCoverage: {
        gte: MIN_QUALITY_TEXT_COVERAGE
      },
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

  if (keywords.length > 0) {
    andConditions.push({
      OR: [
        ...keywords.flatMap((token) => [
          { chunkText: { contains: token } },
          { chapterTitle: { contains: token } },
          { sectionTitle: { contains: token } },
          { keywords: { contains: token } },
          { document: { title: { contains: token } } },
          { document: { code: { contains: token } } }
        ])
      ]
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const [chunks, categoryRows] = await prisma.$transaction([
    prisma.documentChunk.findMany({
      where,
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
            source: true,
            publishDate: true
          }
        }
      }
    }),
    prisma.document.findMany({
      where: {
        status: "ACTIVE",
        ingestStage: "COMPLETED",
        textCoverage: {
          gte: MIN_QUALITY_TEXT_COVERAGE
        },
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

  const grouped = new Map<
    string,
    {
      documentId: string;
      title: string;
      code: string;
      category: string;
      source: string | null;
      publishDate: string | null;
      bestChunkId: string;
      bestChapterTitle: string;
      bestSectionTitle: string;
      bestPageNumber: number | null;
      bestSortOrder: number;
      snippet: string;
      matchChunkCount: number;
    }
  >();

  for (const chunk of chunks) {
    const existing = grouped.get(chunk.document.id);
    if (!existing) {
      grouped.set(chunk.document.id, {
        documentId: chunk.document.id,
        title: chunk.document.title,
        code: chunk.document.code,
        category: chunk.document.category,
        source: chunk.document.source,
        publishDate: chunk.document.publishDate?.toISOString() ?? null,
        bestChunkId: chunk.id,
        bestChapterTitle: chunk.chapterTitle ?? "",
        bestSectionTitle: chunk.sectionTitle ?? "",
        bestPageNumber: chunk.pageNumber ?? null,
        bestSortOrder: chunk.sortOrder,
        snippet: buildSnippet(chunk.chunkText, keywords),
        matchChunkCount: 1
      });
      continue;
    }

    existing.matchChunkCount += 1;
  }

  const groupedResults = Array.from(grouped.values());
  const total = groupedResults.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const results = groupedResults.slice(start, end);

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
