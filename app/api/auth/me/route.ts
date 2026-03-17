import { NextResponse } from "next/server";
import { getAuthenticatedUserFromRequest } from "@/lib/user-auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request);
  return NextResponse.json({
    authenticated: Boolean(user),
    user
  });
}
