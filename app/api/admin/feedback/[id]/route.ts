import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/auth";
import { FEEDBACK_STATUSES } from "@/lib/constants/status";
import { prisma } from "@/lib/prisma";

const updateFeedbackSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
  note: z.string().max(1000, "备注过长").optional().default("")
});

type Params = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: Params) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ message: "未登录或会话失效" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  const parsed = updateFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  try {
    const updated = await prisma.feedback.update({
      where: { id: params.id },
      data: {
        status: parsed.data.status,
        note: parsed.data.note || null
      },
      select: {
        id: true,
        status: true,
        note: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      message: "更新成功",
      feedback: {
        ...updated,
        updatedAt: updated.updatedAt.toISOString()
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ message: "反馈不存在" }, { status: 404 });
    }
    return NextResponse.json({ message: "更新失败，请稍后重试" }, { status: 500 });
  }
}
