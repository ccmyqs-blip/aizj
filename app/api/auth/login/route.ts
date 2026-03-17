import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { buildUserSessionCookie, createUserSession, verifyPassword } from "@/lib/user-auth";

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名").max(40),
  password: z.string().min(1, "请输入密码").max(64)
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const rate = checkRateLimit(`${ip}:${userAgent.slice(0, 80)}:login`, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 30,
    minIntervalMs: 1000
  });
  if (!rate.allowed) {
    return NextResponse.json({ message: "操作过于频繁，请稍后再试" }, { status: 429 });
  }

  const username = parsed.data.username.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      passwordHash: true
    }
  });

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ message: "用户名或密码错误" }, { status: 401 });
  }

  const session = await createUserSession(user.id);
  const response = NextResponse.json({
    message: "登录成功",
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    }
  });
  response.cookies.set(buildUserSessionCookie(session.token));
  return response;
}
