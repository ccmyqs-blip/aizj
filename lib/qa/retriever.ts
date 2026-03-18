import { prisma } from "@/lib/prisma";
import { normalizeKeywords } from "@/lib/search-utils";
import {
  embedTextWithMultimodalModel,
  embedTextWithTextModel,
  getMultimodalEmbeddingModel,
  getTextEmbeddingModel
} from "@/lib/embedding";
import { cosineSimilarity, parseVectorJson } from "@/lib/vector";
import type { RetrievedChunk } from "./types";

export type RetrieveOptions = {
  topK?: number;
};

export interface ChunkRetriever {
  retrieve(question: string, options?: RetrieveOptions): Promise<RetrievedChunk[]>;
}

type RankedItem = RetrievedChunk & {
  score: number;
};

const GENERIC_KEYWORDS = new Set([
  "工程",
  "规则",
  "计算",
  "依据",
  "规范",
  "造价",
  "项目",
  "问题",
  "相关",
  "如何",
  "是否"
]);

const MIN_QUALITY_TEXT_COVERAGE = Number(process.env.RETRIEVER_MIN_TEXT_COVERAGE ?? 0.2);

function buildKeywordBuckets(question: string) {
  const keywords = normalizeKeywords(question).slice(0, 30);
  const strongKeywords = keywords
    .filter((token) => token.length >= 2)
    .filter((token) => !GENERIC_KEYWORDS.has(token))
    .slice(0, 12);

  return {
    keywords,
    strongKeywords
  };
}

function scoreKeywordMatch(
  question: string,
  questionKeywords: string[],
  strongKeywords: string[],
  fields: {
    chunkText: string;
    chapterTitle: string;
    sectionTitle: string;
    title: string;
    code: string;
    keywords: string;
  }
) {
  const chunkText = fields.chunkText.toLowerCase();
  const chapterTitle = fields.chapterTitle.toLowerCase();
  const sectionTitle = fields.sectionTitle.toLowerCase();
  const title = fields.title.toLowerCase();
  const code = fields.code.toLowerCase();
  const keywords = fields.keywords.toLowerCase();
  const normalizedQuestion = question.toLowerCase().trim();

  let score = 0;

  for (const keyword of questionKeywords) {
    const token = keyword.toLowerCase();
    if (!token) {
      continue;
    }

    if (chunkText.includes(token)) score += 4;
    if (chapterTitle.includes(token)) score += 3;
    if (sectionTitle.includes(token)) score += 3;
    if (keywords.includes(token)) score += 5;
    if (title.includes(token)) score += 2;
    if (code.includes(token)) score += 2;
  }

  for (const keyword of strongKeywords) {
    const token = keyword.toLowerCase();
    if (!token) {
      continue;
    }

    if (chunkText.includes(token)) score += 8;
    if (chapterTitle.includes(token)) score += 6;
    if (sectionTitle.includes(token)) score += 6;
    if (keywords.includes(token)) score += 10;
    if (title.includes(token)) score += 4;
    if (code.includes(token)) score += 4;
  }

  if (normalizedQuestion && chunkText.includes(normalizedQuestion)) {
    score += 16;
  }

  return score;
}

function mergeRanked(map: Map<string, RankedItem>, rows: RankedItem[]) {
  for (const item of rows) {
    const prev = map.get(item.chunkId);
    if (!prev) {
      map.set(item.chunkId, item);
      continue;
    }

    prev.score += item.score;
  }
}

async function retrieveKeywordCandidates(question: string, maxCandidates = 180) {
  const { keywords, strongKeywords } = buildKeywordBuckets(question);
  const uploadedActiveDocumentScope = {
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

  const retrievalTokens = strongKeywords.length > 0 ? strongKeywords : keywords;

  const where =
    retrievalTokens.length === 0
      ? uploadedActiveDocumentScope
      : {
          AND: [
            uploadedActiveDocumentScope,
            {
              OR: retrievalTokens.flatMap((token) => [
                { chunkText: { contains: token } },
                { chapterTitle: { contains: token } },
                { sectionTitle: { contains: token } },
                { keywords: { contains: token } },
                { document: { title: { contains: token } } },
                { document: { code: { contains: token } } }
              ])
            }
          ]
        };

  const candidates = await prisma.documentChunk.findMany({
    where,
    take: maxCandidates,
    orderBy: [{ document: { updatedAt: "desc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      chunkText: true,
      chapterTitle: true,
      sectionTitle: true,
      pageNumber: true,
      keywords: true,
      documentId: true,
      document: {
        select: {
          title: true,
          code: true
        }
      }
    }
  });

  return candidates.map((item) => {
    const keywordScore = scoreKeywordMatch(question, keywords, strongKeywords, {
      chunkText: item.chunkText,
      chapterTitle: item.chapterTitle ?? "",
      sectionTitle: item.sectionTitle ?? "",
      keywords: item.keywords ?? "",
      title: item.document.title,
      code: item.document.code
    });

    return {
      chunkId: item.id,
      documentId: item.documentId,
      documentTitle: item.document.title,
      documentCode: item.document.code,
      chapterTitle: item.chapterTitle,
      sectionTitle: item.sectionTitle,
      pageNumber: item.pageNumber,
      chunkText: item.chunkText,
      score: keywordScore
    } satisfies RankedItem;
  });
}

async function retrieveEmbeddingCandidates(
  question: string,
  model: string,
  queryEmbeddingFn: (input: string) => Promise<{ model: string; vector: number[] } | null>,
  weight: number
) {
  const queryEmbedding = await queryEmbeddingFn(question).catch(() => null);
  if (!queryEmbedding || queryEmbedding.vector.length === 0) {
    return [] as RankedItem[];
  }

  const maxEmbeddingRows = Number(process.env.RETRIEVER_MAX_EMBEDDING_ROWS ?? 5000);
  const maxTopRows = Number(process.env.RETRIEVER_MAX_TOP_EMBEDDING_MATCHES ?? 120);

  const rows = await prisma.documentChunkEmbedding.findMany({
    where: {
      model,
      chunk: {
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
      }
    },
    take: maxEmbeddingRows,
    orderBy: { updatedAt: "desc" },
    select: {
      chunkId: true,
      vector: true,
      chunk: {
        select: {
          id: true,
          documentId: true,
          chunkText: true,
          chapterTitle: true,
          sectionTitle: true,
          pageNumber: true,
          document: {
            select: {
              title: true,
              code: true
            }
          }
        }
      }
    }
  });

  const ranked = rows
    .map((item) => {
      const target = parseVectorJson(item.vector);
      const similarity = cosineSimilarity(queryEmbedding.vector, target);
      return {
        chunkId: item.chunkId,
        documentId: item.chunk.documentId,
        documentTitle: item.chunk.document.title,
        documentCode: item.chunk.document.code,
        chapterTitle: item.chunk.chapterTitle,
        sectionTitle: item.chunk.sectionTitle,
        pageNumber: item.chunk.pageNumber,
        chunkText: item.chunk.chunkText,
        score: similarity > 0 ? similarity * weight : 0
      } satisfies RankedItem;
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTopRows);

  return ranked;
}

export class PrismaKeywordChunkRetriever implements ChunkRetriever {
  async retrieve(question: string, options?: RetrieveOptions) {
    const topK = options?.topK ?? 8;
    const rankedMap = new Map<string, RankedItem>();

    const keywordRows = await retrieveKeywordCandidates(question, 240);
    mergeRanked(
      rankedMap,
      keywordRows
        .filter((item) => item.score > 0)
        .map((item) => ({
          ...item,
          score: item.score * 1.5
        }))
    );

    const textEmbeddingRows = await retrieveEmbeddingCandidates(
      question,
      getTextEmbeddingModel(),
      embedTextWithTextModel,
      14
    );
    mergeRanked(rankedMap, textEmbeddingRows);

    const multimodalRows = await retrieveEmbeddingCandidates(
      question,
      getMultimodalEmbeddingModel(),
      embedTextWithMultimodalModel,
      11
    );
    mergeRanked(rankedMap, multimodalRows);

    return Array.from(rankedMap.values())
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((item) => ({
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentTitle: item.documentTitle,
        documentCode: item.documentCode,
        chapterTitle: item.chapterTitle,
        sectionTitle: item.sectionTitle,
        pageNumber: item.pageNumber,
        chunkText: item.chunkText,
        score: item.score
      }));
  }
}

let defaultRetriever: ChunkRetriever | null = null;

export function getDefaultChunkRetriever() {
  if (!defaultRetriever) {
    defaultRetriever = new PrismaKeywordChunkRetriever();
  }
  return defaultRetriever;
}
