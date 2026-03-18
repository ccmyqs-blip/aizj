import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { consumeRateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";

type LimitRule = {
  name: "qa" | "trial" | "admin_page" | "admin_api" | "admin_upload" | "admin_documents_delete";
  limit: number;
  windowMs: number;
  match: (pathname: string) => boolean;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

const ADMIN_UPLOAD_LIMIT_PER_MINUTE = parsePositiveInt(process.env.ADMIN_UPLOAD_RATE_LIMIT_PER_MINUTE, 20);
const ADMIN_DOCUMENT_DELETE_LIMIT_PER_MINUTE = parsePositiveInt(
  process.env.ADMIN_DOCUMENT_DELETE_RATE_LIMIT_PER_MINUTE,
  20
);

const LIMIT_RULES: LimitRule[] = [
  {
    name: "qa",
    limit: 5,
    windowMs: 60_000,
    match: (pathname) => pathname === "/api/qa" || pathname.startsWith("/api/qa/")
  },
  {
    name: "trial",
    limit: 10,
    windowMs: 60_000,
    // Keep compatibility with current project where trial leads API is /api/leads.
    match: (pathname) =>
      pathname === "/api/trial" ||
      pathname.startsWith("/api/trial/") ||
      pathname === "/api/leads" ||
      pathname.startsWith("/api/leads/")
  },
  {
    // Allow higher rate for multi-file admin upload, while keeping admin API strict elsewhere.
    name: "admin_upload",
    limit: ADMIN_UPLOAD_LIMIT_PER_MINUTE,
    windowMs: 60_000,
    match: (pathname) =>
      pathname === "/api/admin/documents/upload" ||
      pathname.startsWith("/api/admin/documents/upload/")
  },
  {
    // Document delete can be batched from admin UI; keep separate from strict admin_api bucket.
    name: "admin_documents_delete",
    limit: ADMIN_DOCUMENT_DELETE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
    match: (pathname) =>
      pathname.startsWith("/api/admin/documents/") &&
      pathname !== "/api/admin/documents/upload" &&
      !pathname.startsWith("/api/admin/documents/upload/")
  },
  {
    name: "admin_page",
    limit: 20,
    windowMs: 60_000,
    match: (pathname) =>
      pathname === "/admin" ||
      pathname.startsWith("/admin/")
  },
  {
    name: "admin_api",
    limit: 3,
    windowMs: 60_000,
    match: (pathname) => pathname === "/api/admin" || pathname.startsWith("/api/admin/")
  }
];

const SUSPICIOUS_UA_PATTERNS = [
  "curl",
  "wget",
  "python-requests",
  "httpclient",
  "scrapy",
  "selenium",
  "playwright",
  "postmanruntime"
];

function shouldBypassRateLimit() {
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return true;
  }

  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_RATE_LIMIT_IN_DEV === "true") {
    return true;
  }

  return false;
}

function isSuspiciousUserAgent(ua: string) {
  const normalized = ua.toLowerCase();
  if (!normalized) {
    return true;
  }

  return SUSPICIOUS_UA_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function buildRateLimitExceededResponse(rule: LimitRule, retryAfterSeconds: number) {
  const response = NextResponse.json(
    {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please retry later.",
        routeGroup: rule.name,
        limit: rule.limit,
        windowSeconds: Math.ceil(rule.windowMs / 1000),
        retryAfterSeconds
      }
    },
    { status: 429 }
  );

  response.headers.set("Retry-After", String(retryAfterSeconds));
  response.headers.set("X-RateLimit-Limit", String(rule.limit));
  response.headers.set("X-RateLimit-Window", String(Math.ceil(rule.windowMs / 1000)));
  response.headers.set("X-RateLimit-Remaining", "0");

  return response;
}

export function middleware(request: NextRequest) {
  if (shouldBypassRateLimit()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const rule = LIMIT_RULES.find((item) => item.match(pathname));
  if (!rule) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "";

  if (isSuspiciousUserAgent(userAgent)) {
    logSecurityEvent({
      eventType: "SUSPICIOUS_USER_AGENT",
      ip,
      userAgent,
      path: pathname,
      detail: "matched suspicious user-agent pattern"
    });
  }

  const key = `${rule.name}:${ip}`;
  const result = consumeRateLimit(key, rule.limit, rule.windowMs);

  if (!result.allowed) {
    if (rule.name === "qa") {
      logSecurityEvent({
        eventType: "QA_RATE_LIMIT_HIT",
        ip,
        userAgent,
        path: pathname,
        detail: `limit=${rule.limit},window=${Math.ceil(rule.windowMs / 1000)}s`
      });
    }

    if (rule.name === "trial") {
      logSecurityEvent({
        eventType: "TRIAL_RATE_LIMIT_HIT",
        ip,
        userAgent,
        path: pathname,
        detail: `limit=${rule.limit},window=${Math.ceil(rule.windowMs / 1000)}s`
      });
    }

    return buildRateLimitExceededResponse(rule, result.retryAfterSeconds);
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Window", String(result.windowSeconds));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));

  return response;
}

export const config = {
  matcher: [
    "/api/qa/:path*",
    "/api/trial/:path*",
    "/api/leads/:path*",
    "/admin/:path*",
    "/api/admin/:path*"
  ]
};
