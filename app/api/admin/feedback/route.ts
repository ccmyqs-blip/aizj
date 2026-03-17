import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/auth";
import { FEEDBACK_STATUSES } from "@/lib/constants/status";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  take: z.coerce.number().int().min(1).max(200).optional().default(80)
});

export async function GET(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ message: "未登录或会话失效" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    take: searchParams.get("take") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const rows = await prisma.feedback.findMany({
    where: parsed.data.status
      ? {
          status: parsed.data.status
        }
      : undefined,
    orderBy: {
      createdAt: "desc"
    },
    take: parsed.data.take,
    select: {
      id: true,
      feedbackType: true,
      sourcePage: true,
      content: true,
      contact: true,
      rating: true,
      status: true,
      note: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    feedbacks: rows.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  });
}
