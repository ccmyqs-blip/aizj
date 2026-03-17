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

function scoreKeywordMatch(
  questionKeywords: string[],
  fields: { chunkText: string; chapterTitle: string; sectionTitle: string; title: string; code: string }
) {
  const chunkText = fields.chunkText.toLowerCase();
  const chapterTitle = fields.chapterTitle.toLowerCase();
  const sectionTitle = fields.sectionTitle.toLowerCase();
  const title = fields.title.toLowerCase();
  const code = fields.code.toLowerCase();

  return questionKeywords.reduce((score, keyword) => {
    const token = keyword.toLowerCase();
    let next = score;
    if (chunkText.includes(token)) next += 3;
    if (chapterTitle.includes(token)) next += 2;
    if (sectionTitle.includes(token)) next += 2;
    if (title.includes(token)) next += 1;
    if (code.includes(token)) next += 1;
    return next;
  }, 0);
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

async function retrieveKeywordCandidates(question: string, maxCandidates = 80) {
  const keywords = normalizeKeywords(question).slice(0, 8);
  const where =
    keywords.length === 0
      ? {}
      : {
          OR: keywords.flatMap((token) => [
            { chunkText: { contains: token } },
            { chapterTitle: { contains: token } },
            { sectionTitle: { contains: token } },
            { document: { title: { contains: token } } },
            { document: { code: { contains: token } } }
          ])
        };

  const candidates = await prisma.documentChunk.findMany({
    where,
    take: maxCandidates,
    orderBy: [{ document: { publishDate: "desc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      chunkText: true,
      chapterTitle: true,
      sectionTitle: true,
      pageNumber: true,
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
    const keywordScore = scoreKeywordMatch(keywords, {
      chunkText: item.chunkText,
      chapterTitle: item.chapterTitle ?? "",
      sectionTitle: item.sectionTitle ?? "",
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

  const maxEmbeddingRows = Number(process.env.RETRIEVER_MAX_EMBEDDING_ROWS ?? 3000);
  const maxTopRows = Number(process.env.RETRIEVER_MAX_TOP_EMBEDDING_MATCHES ?? 80);

  const rows = await prisma.documentChunkEmbedding.findMany({
    where: { model },
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
    const topK = options?.topK ?? 6;
    const rankedMap = new Map<string, RankedItem>();

    const keywordRows = await retrieveKeywordCandidates(question, 80);
    mergeRanked(
      rankedMap,
      keywordRows
        .filter((item) => item.score > 0)
        .map((item) => ({
          ...item,
          score: item.score * 1.2
        }))
    );

    const textEmbeddingRows = await retrieveEmbeddingCandidates(
      question,
      getTextEmbeddingModel(),
      embedTextWithTextModel,
      12
    );
    mergeRanked(rankedMap, textEmbeddingRows);

    const multimodalRows = await retrieveEmbeddingCandidates(
      question,
      getMultimodalEmbeddingModel(),
      embedTextWithMultimodalModel,
      10
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
