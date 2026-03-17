import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).optional().default(50)
});

export async function GET(request: Request) {
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

  const rows = await prisma.qARecord.findMany({
    where: {
      userId: user.id
    },
    orderBy: {
      createdAt: "desc"
    },
    take: parsed.data.take,
    select: {
      id: true,
      question: true,
      answer: true,
      modelName: true,
      createdAt: true
    }
  });

  return NextResponse.json({
    items: rows.map((item) => ({
      id: item.id,
      question: item.question,
      answerPreview: item.answer.slice(0, 120),
      modelName: item.modelName,
      createdAt: item.createdAt.toISOString()
    }))
  });
}
