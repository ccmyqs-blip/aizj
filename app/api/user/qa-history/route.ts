import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).optional().default(80)
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

  const rows = await prisma.qAConversation.findMany({
    where: {
      userId: user.id
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: parsed.data.take,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          records: true
        }
      },
      records: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        select: {
          question: true
        }
      }
    }
  });

  return NextResponse.json({
    items: rows.map((item) => ({
      id: item.id,
      title: item.title,
      lastQuestion: item.records[0]?.question ?? "",
      messageCount: item._count.records,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  });
}
