import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAnswer } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { getDefaultChunkRetriever } from "@/lib/qa/retriever";
import type { QACitation } from "@/lib/qa/types";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

const askSchema = z.object({
  question: z.string().min(4, "问题过短，请补充具体场景").max(300, "问题过长，请精简后再试")
});

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
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
    const userAgent = request.headers.get("user-agent");
    const ip = getClientIp(request);
    const user = await getAuthenticatedUserFromRequest(request);

    const retriever = getDefaultChunkRetriever();
    const retrievedChunks = await retriever.retrieve(question, { topK: 6 });

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
      }))
    );

    const answer = llmResult.answer;
    const citations: QACitation[] = llmResult.citations;
    const modelName = llmResult.modelName;

    const savedRecord = await prisma.qARecord
      .create({
        data: {
          userId: user?.id ?? null,
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

    return NextResponse.json({
      answer,
      citations,
      modelName,
      recordId: savedRecord?.id ?? null
    });
  } catch {
    return NextResponse.json({ message: "问答服务暂时不可用" }, { status: 500 });
  }
}
