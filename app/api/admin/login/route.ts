import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE_NAME, createAdminSessionToken, getAdminPassword } from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1, "请输入密码")
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "请求格式错误" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "参数错误" }, { status: 400 });
  }

  if (parsed.data.password !== getAdminPassword()) {
    return NextResponse.json({ message: "密码错误" }, { status: 401 });
  }

  const response = NextResponse.json({ message: "登录成功" });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: createAdminSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return response;
}
