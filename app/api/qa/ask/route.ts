import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAnswer } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { getDefaultChunkRetriever } from "@/lib/qa/retriever";
import type { QACitation } from "@/lib/qa/types";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

const askSchema = z.object({
  question: z.string().trim().min(4, "问题过短，请补充具体场景").max(300, "问题过长，请精简后再试"),
  conversationId: z.string().trim().min(1).max(64).optional()
});

function buildConversationTitle(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  return normalized.length > 30 ? `${normalized.slice(0, 30)}...` : normalized;
}

function buildRetrieverQuery(question: string, previousQuestions: string[]) {
  if (previousQuestions.length === 0) {
    return question;
  }
  return [...previousQuestions, question].join(" ");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "请求体格式错误" }, { status: 400 });
  }

  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  try {
    const question = parsed.data.question.trim();
    const incomingConversationId = parsed.data.conversationId?.trim() || null;
    const userAgent = request.headers.get("user-agent");
    const ip = getClientIp(request);
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ message: "请先登录后再提问" }, { status: 401 });
    }

    let conversationId = "";
    let turnIndex = 1;
    let conversationTurns: Array<{ question: string; answer: string }> = [];
    let previousQuestions: string[] = [];

    if (incomingConversationId) {
      const conversation = await prisma.qAConversation.findFirst({
        where: {
          id: incomingConversationId,
          userId: user.id
        },
        select: {
          id: true
        }
      });

      if (!conversation) {
        return NextResponse.json({ message: "会话不存在或无权限访问" }, { status: 404 });
      }

      conversationId = conversation.id;

      const previousRecords = await prisma.qARecord.findMany({
        where: {
          userId: user.id,
          conversationId
        },
        orderBy: [{ turnIndex: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: {
          question: true,
          answer: true,
          turnIndex: true
        }
      });

      const ordered = previousRecords.slice().reverse();
      conversationTurns = ordered.map((item) => ({
        question: item.question,
        answer: item.answer
      }));
      previousQuestions = ordered.map((item) => item.question).slice(-3);
      turnIndex = (previousRecords[0]?.turnIndex ?? 0) + 1;
    } else {
      const createdConversation = await prisma.qAConversation.create({
        data: {
          userId: user.id,
          title: buildConversationTitle(question)
        },
        select: {
          id: true
        }
      });

      conversationId = createdConversation.id;
      turnIndex = 1;
    }

    const retriever = getDefaultChunkRetriever();
    const retrievalQuery = buildRetrieverQuery(question, previousQuestions);
    const retrievedChunks = await retriever.retrieve(retrievalQuery, {
      topK: previousQuestions.length > 0 ? 8 : 6
    });

    const llmResult = await generateAnswer(
      question,
      retrievedChunks.map((item) => ({
        chunkId: item.chunkId,
        documentTitle: item.documentTitle,
        documentCode: item.documentCode,
        chapterTitle: item.chapterTitle,
        sectionTitle: item.sectionTitle,
        pageNumber: item.pageNumber,
        chunkText: item.chunkText
      })),
      {
        conversationTurns
      }
    );

    const answer = llmResult.answer;
    const citations: QACitation[] = llmResult.citations;
    const modelName = llmResult.modelName;

    const savedRecord = await prisma.qARecord
      .create({
        data: {
          userId: user.id,
          conversationId,
          turnIndex,
          question,
          answer,
          sourceChunkIds: JSON.stringify(citations.map((item) => item.chunkId)),
          modelName,
          ip,
          userAgent
        },
        select: {
          id: true
        }
      })
      .catch(() => null);

    await prisma.qAConversation
      .update({
        where: {
          id: conversationId
        },
        data: {
          updatedAt: new Date()
        }
      })
      .catch(() => null);

    return NextResponse.json({
      answer,
      citations,
      modelName,
      recordId: savedRecord?.id ?? null,
      conversationId,
      turnIndex
    });
  } catch {
    return NextResponse.json({ message: "问答服务暂时不可用" }, { status: 500 });
  }
}
