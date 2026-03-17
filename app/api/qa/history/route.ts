import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildSnippet, normalizeKeywords } from "@/lib/search-utils";

const querySchema = z.object({
  q: z.string().trim().min(2, "请输入至少 2 个字").max(120, "关键词过长"),
  take: z.coerce.number().int().min(1).max(20).optional().default(8)
});

function scoreHistoryItem(
  keywords: string[],
  fields: {
    question: string;
    answer: string;
  }
) {
  const q = fields.question.toLowerCase();
  const a = fields.answer.toLowerCase();

  return keywords.reduce((score, tokenRaw) => {
    const token = tokenRaw.toLowerCase();
    let next = score;
    if (q.includes(token)) next += 4;
    if (a.includes(token)) next += 2;
    return next;
  }, 0);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? "",
    take: searchParams.get("take") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const query = parsed.data.q;
  const take = parsed.data.take;
  const keywords = normalizeKeywords(query).slice(0, 8);

  const where =
    keywords.length === 0
      ? undefined
      : {
          OR: keywords.flatMap((token) => [{ question: { contains: token } }, { answer: { contains: token } }])
        };

  const rows = await prisma.qARecord.findMany({
    where,
    take: 120,
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      question: true,
      answer: true,
      modelName: true,
      createdAt: true
    }
  });

  const ranked = rows
    .map((item) => ({
      ...item,
      score: scoreHistoryItem(keywords, {
        question: item.question,
        answer: item.answer
      })
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, take)
    .map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      answerSnippet: buildSnippet(item.answer, keywords, 140),
      modelName: item.modelName,
      score: item.score,
      createdAt: item.createdAt.toISOString()
    }));

  return NextResponse.json(
    {
      items: ranked
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
