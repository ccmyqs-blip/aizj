import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { buildUserSessionCookie, createUserSession, hashPassword } from "@/lib/user-auth";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 位")
    .max(24, "用户名最多 24 位")
    .regex(/^[a-zA-Z0-9_]+$/, "用户名仅支持字母、数字、下划线"),
  password: z.string().min(6, "密码至少 6 位").max(64, "密码过长"),
  displayName: z.string().trim().max(32, "昵称过长").optional().default("")
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
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const rate = checkRateLimit(`${ip}:${userAgent.slice(0, 80)}:register`, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 15,
    minIntervalMs: 1500
  });
  if (!rate.allowed) {
    return NextResponse.json({ message: "操作过于频繁，请稍后再试" }, { status: 429 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username.toLowerCase(),
        passwordHash: hashPassword(parsed.data.password),
        displayName: parsed.data.displayName || null
      },
      select: {
        id: true,
        username: true,
        displayName: true
      }
    });

    const session = await createUserSession(user.id);
    const response = NextResponse.json({
      message: "注册成功",
      user
    });
    response.cookies.set(buildUserSessionCookie(session.token));
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ message: "用户名已存在" }, { status: 409 });
    }
    return NextResponse.json({ message: "注册失败，请稍后重试" }, { status: 500 });
  }
}
