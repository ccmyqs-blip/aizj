import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "eca_admin_session";

function hashAdminPassword(password: string) {
  return createHash("sha256").update(`eca:${password}`).digest("hex");
}

export function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD?.trim();
  return password && password.length > 0 ? password : null;
}

export function getAdminSessionMaxAgeSeconds() {
  const value = Number(process.env.ADMIN_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 12);
  if (!Number.isFinite(value) || value < 60) {
    return 60 * 60 * 12;
  }
  return Math.floor(value);
}

export function createAdminSessionToken(password: string) {
  return hashAdminPassword(password);
}

export function createConfiguredAdminSessionToken() {
  const password = getAdminPassword();
  if (!password) {
    return null;
  }
  return createAdminSessionToken(password);
}

export function isAdminAuthenticated() {
  const expected = createConfiguredAdminSessionToken();
  if (!expected) {
    return false;
  }

  const sessionToken = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return false;
  }

  return sessionToken === expected;
}

export function buildAdminSessionCookie(token: string) {
  return {
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAdminSessionMaxAgeSeconds()
  };
}

export function buildClearAdminSessionCookie() {
  return {
    name: ADMIN_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/"
  };
}
