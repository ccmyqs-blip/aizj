import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const USER_SESSION_COOKIE_NAME = "eca_user_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function hashToken(token: string) {
  return createHash("sha256").update(`eca-user:${token}`).digest("hex");
}

function parseCookiesFromRequest(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const index = item.indexOf("=");
      if (index <= 0) {
        return acc;
      }
      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function getUserSessionTokenFromRequest(request: Request) {
  const cookieMap = parseCookiesFromRequest(request);
  return cookieMap[USER_SESSION_COOKIE_NAME] ?? "";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const incoming = scryptSync(password, salt, 64);
  const saved = Buffer.from(hash, "hex");
  if (incoming.length !== saved.length) {
    return false;
  }
  return timingSafeEqual(incoming, saved);
}

export async function createUserSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });

  return {
    token,
    expiresAt
  };
}

export async function deleteUserSessionByToken(token: string) {
  if (!token) {
    return;
  }
  const tokenHash = hashToken(token);
  await prisma.userSession.deleteMany({
    where: {
      tokenHash
    }
  });
}

export async function getAuthenticatedUser() {
  const token = cookies().get(USER_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const tokenHash = hashToken(token);

  const session = await prisma.userSession.findUnique({
    where: {
      tokenHash
    },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.userSession.delete({
      where: {
        id: session.id
      }
    });
    return null;
  }

  return session.user;
}

export async function getAuthenticatedUserFromRequest(request: Request) {
  const token = getUserSessionTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const session = await prisma.userSession.findUnique({
    where: {
      tokenHash
    },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.userSession.delete({
      where: {
        id: session.id
      }
    });
    return null;
  }

  return session.user;
}

export function buildUserSessionCookie(token: string) {
  return {
    name: USER_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}

export function buildClearUserSessionCookie() {
  return {
    name: USER_SESSION_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/"
  };
}
