import { prisma } from "@/lib/prisma";
import { normalizeKeywords } from "@/lib/search-utils";
import type { RetrievedChunk } from "./types";

export type RetrieveOptions = {
  topK?: number;
};

export interface ChunkRetriever {
  retrieve(question: string, options?: RetrieveOptions): Promise<RetrievedChunk[]>;
}

function scoreChunk(questionKeywords: string[], fields: { chunkText: string; chapterTitle: string; sectionTitle: string; title: string; code: string }) {
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

export class PrismaKeywordChunkRetriever implements ChunkRetriever {
  async retrieve(question: string, options?: RetrieveOptions) {
    const topK = options?.topK ?? 6;
    const keywords = normalizeKeywords(question).slice(0, 6);

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
      take: 60,
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

    const ranked = candidates
      .map((item) => {
        const score = scoreChunk(keywords, {
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
          score
        } as RetrievedChunk;
      })
      .sort((a, b) => b.score - a.score);

    // 仅返回与问题至少存在关键词匹配的片段，避免无依据回答。
    return ranked.filter((item) => item.score > 0).slice(0, topK);
  }
}

let defaultRetriever: ChunkRetriever | null = null;

export function getDefaultChunkRetriever() {
  if (!defaultRetriever) {
    defaultRetriever = new PrismaKeywordChunkRetriever();
  }
  return defaultRetriever;
}
