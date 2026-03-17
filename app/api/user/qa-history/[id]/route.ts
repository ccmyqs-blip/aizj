import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

type Params = {
  params: {
    id: string;
  };
};

function parseChunkIds(sourceChunkIds: string | null) {
  if (!sourceChunkIds) {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(sourceChunkIds) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET(request: Request, { params }: Params) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const record = await prisma.qARecord.findFirst({
    where: {
      id: params.id,
      userId: user.id
    },
    select: {
      id: true,
      question: true,
      answer: true,
      modelName: true,
      sourceChunkIds: true,
      createdAt: true
    }
  });

  if (!record) {
    return NextResponse.json({ message: "记录不存在" }, { status: 404 });
  }

  const chunkIds = parseChunkIds(record.sourceChunkIds).slice(0, 8);
  const chunks =
    chunkIds.length > 0
      ? await prisma.documentChunk.findMany({
          where: {
            id: {
              in: chunkIds
            }
          },
          select: {
            id: true,
            chapterTitle: true,
            sectionTitle: true,
            pageNumber: true,
            chunkText: true,
            document: {
              select: {
                title: true,
                code: true
              }
            }
          }
        })
      : [];

  const chunkMap = new Map(chunks.map((item) => [item.id, item]));
  const citations = chunkIds
    .map((id) => chunkMap.get(id))
    .filter(Boolean)
    .map((item) => ({
      chunkId: item!.id,
      documentTitle: item!.document.title,
      documentCode: item!.document.code,
      chapterTitle: item!.chapterTitle,
      sectionTitle: item!.sectionTitle,
      pageNumber: item!.pageNumber,
      excerpt: item!.chunkText.slice(0, 180)
    }));

  return NextResponse.json({
    item: {
      id: record.id,
      question: record.question,
      answer: record.answer,
      modelName: record.modelName,
      createdAt: record.createdAt.toISOString(),
      citations
    }
  });
}
