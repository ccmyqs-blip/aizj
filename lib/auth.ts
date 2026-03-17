import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "eca_admin_session";

export function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (password) {
    return password;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD 未配置，生产环境禁止使用默认密码");
  }

  return "admin123456";
}

function buildSessionToken(password: string) {
  return createHash("sha256").update(`eca:${password}`).digest("hex");
}

export function createAdminSessionToken() {
  return buildSessionToken(getAdminPassword());
}

export function isAdminAuthenticated() {
  const sessionToken = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return false;
  }
  return sessionToken === createAdminSessionToken();
}
