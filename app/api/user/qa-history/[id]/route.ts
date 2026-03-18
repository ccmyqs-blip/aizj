import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

type Params = {
  params: {
    id: string;
  };
};

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).optional().default(80)
});

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

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    take: searchParams.get("take") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const conversation = await prisma.qAConversation.findFirst({
    where: {
      id: params.id,
      userId: user.id
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!conversation) {
    return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  }

  const records = await prisma.qARecord.findMany({
    where: {
      userId: user.id,
      conversationId: conversation.id
    },
    orderBy: [{ turnIndex: "asc" }, { createdAt: "asc" }],
    take: parsed.data.take,
    select: {
      id: true,
      question: true,
      answer: true,
      modelName: true,
      sourceChunkIds: true,
      createdAt: true,
      turnIndex: true
    }
  });

  const uniqueChunkIds = Array.from(new Set(records.flatMap((record) => parseChunkIds(record.sourceChunkIds).slice(0, 8))));

  const chunkRows =
    uniqueChunkIds.length > 0
      ? await prisma.documentChunk.findMany({
          where: {
            id: {
              in: uniqueChunkIds
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

  const chunkMap = new Map(chunkRows.map((item) => [item.id, item]));

  const messages = records.map((record) => {
    const citations = parseChunkIds(record.sourceChunkIds)
      .slice(0, 8)
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

    return {
      id: record.id,
      question: record.question,
      answer: record.answer,
      modelName: record.modelName,
      createdAt: record.createdAt.toISOString(),
      turnIndex: record.turnIndex ?? null,
      citations
    };
  });

  return NextResponse.json({
    item: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages
    }
  });
}
