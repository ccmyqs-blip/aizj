import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { FEEDBACK_TYPES } from "@/lib/constants/status";

const createFeedbackSchema = z.object({
  feedbackType: z.enum(FEEDBACK_TYPES).default("GENERAL"),
  sourcePage: z.string().max(120, "来源页面过长").optional().default(""),
  content: z.string().min(4, "反馈内容至少 4 个字").max(2000, "反馈内容过长"),
  contact: z.string().max(120, "联系方式过长").optional().default(""),
  rating: z.number().int().min(1).max(5).optional(),
  website: z.string().optional().default("")
});

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "请求体格式错误" }, { status: 400 });
  }

  const parsed = createFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  const rateResult = checkRateLimit(`${ip}:${userAgent.slice(0, 80)}:feedback`, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 8,
    minIntervalMs: 3 * 1000
  });

  if (!rateResult.allowed) {
    return NextResponse.json(
      { message: "提交过于频繁，请稍后再试" },
      {
        status: 429,
        headers: {
          "Retry-After": `${Math.ceil(rateResult.retryAfterMs / 1000)}`
        }
      }
    );
  }

  if (parsed.data.website) {
    return NextResponse.json({ message: "提交成功" });
  }

  try {
    const created = await prisma.feedback.create({
      data: {
        feedbackType: parsed.data.feedbackType,
        sourcePage: parsed.data.sourcePage || null,
        content: parsed.data.content,
        contact: parsed.data.contact || null,
        rating: parsed.data.rating ?? null,
        status: "NEW",
        ip,
        userAgent
      },
      select: {
        id: true
      }
    });

    return NextResponse.json({
      message: "提交成功，感谢你的反馈",
      feedbackId: created.id
    });
  } catch {
    return NextResponse.json({ message: "提交失败，请稍后重试" }, { status: 500 });
  }
}
