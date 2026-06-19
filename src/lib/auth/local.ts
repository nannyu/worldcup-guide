import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { type NextRequest, NextResponse } from "next/server";
import {
  createUserSession,
  deleteUserSession,
  getUserBySessionTokenHash,
} from "@/lib/db/queries";
import type { User } from "@/lib/db/schema/users";

const scrypt = promisify(scryptCallback);

export const LOCAL_SESSION_COOKIE = "wc_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_KEY_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    favoriteTeams: user.favoriteTeams,
    favoritePlayers: user.favoritePlayers,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) return false;
  const [scheme, salt, hash] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await createUserSession({ tokenHash: tokenHash(token), userId, expiresAt });
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(LOCAL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentLocalUser(request: NextRequest): Promise<User | undefined> {
  const token = request.cookies.get(LOCAL_SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return getUserBySessionTokenHash(tokenHash(token));
}

export async function clearCurrentSession(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(LOCAL_SESSION_COOKIE)?.value;
  if (token) await deleteUserSession(tokenHash(token));
  clearSessionCookie(response);
}
