import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildAdminSessionCookie,
  createAdminSessionToken,
  getAdminPassword
} from "@/lib/auth";
import { getClientIp } from "@/lib/request-ip";
import {
  clearAdminLoginFailures,
  getAdminLoginGuardStatus,
  recordAdminLoginFailure
} from "@/lib/admin-login-guard";
import { logSecurityEvent } from "@/lib/security-log";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required")
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid params" }, { status: 400 });
  }

  const password = getAdminPassword();
  if (!password) {
    return NextResponse.json({ message: "Admin service is not configured" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "";
  const path = new URL(request.url).pathname;

  const guardStatus = getAdminLoginGuardStatus(ip);
  if (guardStatus.blocked) {
    logSecurityEvent({
      eventType: "ADMIN_ACCESS_BLOCKED",
      ip,
      userAgent,
      path,
      detail: `blocked by brute-force guard, retryAfter=${guardStatus.retryAfterSeconds}s`
    });

    return NextResponse.json(
      {
        message: "Too many failed attempts. Please retry later."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(guardStatus.retryAfterSeconds)
        }
      }
    );
  }

  if (parsed.data.password !== password) {
    const failureStatus = recordAdminLoginFailure(ip);

    logSecurityEvent({
      eventType: "ADMIN_LOGIN_FAILURE",
      ip,
      userAgent,
      path,
      detail: failureStatus.blocked
        ? `blocked after failure, retryAfter=${failureStatus.retryAfterSeconds}s`
        : "password mismatch"
    });

    if (failureStatus.blocked) {
      logSecurityEvent({
        eventType: "ADMIN_ACCESS_BLOCKED",
        ip,
        userAgent,
        path,
        detail: `blocked by brute-force guard, retryAfter=${failureStatus.retryAfterSeconds}s`
      });

      return NextResponse.json(
        {
          message: "Too many failed attempts. Please retry later."
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(failureStatus.retryAfterSeconds)
          }
        }
      );
    }

    return NextResponse.json({ message: "Login failed" }, { status: 401 });
  }

  clearAdminLoginFailures(ip);

  const response = NextResponse.json({ message: "Login success" });
  response.cookies.set(buildAdminSessionCookie(createAdminSessionToken(password)));

  logSecurityEvent({
    eventType: "ADMIN_LOGIN_SUCCESS",
    ip,
    userAgent,
    path,
    detail: "admin login success"
  });

  return response;
}
