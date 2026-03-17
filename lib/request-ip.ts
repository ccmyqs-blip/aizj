/**
 * Unified client IP resolver.
 * Priority:
 * 1) x-forwarded-for (first value)
 * 2) x-real-ip / cf-connecting-ip / x-client-ip
 * 3) request.ip when available
 */
export function getClientIp(input: {
  headers: { get(name: string): string | null };
  ip?: string | null;
}): string {
  const forwardedFor = input.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor
      .split(",")
      .map((item) => item.trim())
      .find(Boolean);

    if (first) {
      return first;
    }
  }

  const headerCandidates = ["x-real-ip", "cf-connecting-ip", "x-client-ip"];
  for (const name of headerCandidates) {
    const value = input.headers.get(name)?.trim();
    if (value) {
      return value;
    }
  }

  if (input.ip && input.ip.trim()) {
    return input.ip.trim();
  }

  return "unknown";
}
