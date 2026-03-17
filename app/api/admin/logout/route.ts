import { NextResponse } from "next/server";
import { buildClearAdminSessionCookie, isAdminAuthenticated } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  response.cookies.set(buildClearAdminSessionCookie());
  return response;
}
