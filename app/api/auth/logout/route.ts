import { NextResponse } from "next/server";
import { buildClearUserSessionCookie, deleteUserSessionByToken, getUserSessionTokenFromRequest } from "@/lib/user-auth";

export async function POST(request: Request) {
  const token = getUserSessionTokenFromRequest(request);
  await deleteUserSessionByToken(token).catch(() => null);

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(buildClearUserSessionCookie());
  return response;
}

export async function DELETE(request: Request) {
  const token = getUserSessionTokenFromRequest(request);
  await deleteUserSessionByToken(token).catch(() => null);

  const response = NextResponse.json({ message: "已退出登录" });
  response.cookies.set(buildClearUserSessionCookie());
  return response;
}
