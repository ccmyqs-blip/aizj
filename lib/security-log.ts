export type SecurityEventType =
  | "QA_RATE_LIMIT_HIT"
  | "TRIAL_RATE_LIMIT_HIT"
  | "ADMIN_LOGIN_FAILURE"
  | "ADMIN_LOGIN_SUCCESS"
  | "ADMIN_ACCESS_BLOCKED"
  | "SUSPICIOUS_USER_AGENT";

export type SecurityLogInput = {
  eventType: SecurityEventType;
  ip: string;
  userAgent: string;
  path: string;
  detail?: string;
};

export function logSecurityEvent(input: SecurityLogInput) {
  const record = {
    time: new Date().toISOString(),
    eventType: input.eventType,
    ip: input.ip,
    userAgent: input.userAgent,
    path: input.path,
    detail: input.detail ?? ""
  };

  // Use stdout for Docker-friendly production logging.
  if (process.env.NODE_ENV === "production") {
    console.info(JSON.stringify({ level: "security", ...record }));
    return;
  }

  // Development-friendly readable output.
  console.log("[security]", JSON.stringify(record));
}
