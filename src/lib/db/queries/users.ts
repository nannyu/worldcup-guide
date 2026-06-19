import { randomUUID } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "../client";
import { userSessions, users, type User } from "../schema/users";

export async function getUserById(id: string): Promise<User | undefined> {
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const rows = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function upsertUser(data: {
  id: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<User> {
  const rows = await getDb()
    .insert(users)
    .values(data)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: data.email ?? null,
        name: data.name ?? null,
        avatarUrl: data.avatarUrl ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return rows[0];
}

export async function updateUser(
  id: string,
  data: {
    name?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    favoriteTeams?: string[];
    favoritePlayers?: string[];
  }
): Promise<User | undefined> {
  if (Object.keys(data).length === 0) return getUserById(id);

  const rows = await getDb()
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return rows[0];
}

export async function createEmailUser(data: {
  email: string;
  passwordHash: string;
  name?: string | null;
}): Promise<User> {
  const rows = await getDb()
    .insert(users)
    .values({
      id: `user_${randomUUID()}`,
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name ?? null,
      favoriteTeams: [],
      favoritePlayers: [],
    })
    .returning();
  return rows[0];
}

export async function updateUserPassword(
  id: string,
  passwordHash: string
): Promise<User | undefined> {
  const rows = await getDb()
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return rows[0];
}

export async function createUserSession(data: {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}) {
  const rows = await getDb()
    .insert(userSessions)
    .values(data)
    .returning();
  return rows[0];
}

export async function getUserBySessionTokenHash(tokenHash: string): Promise<User | undefined> {
  const rows = await getDb()
    .select({ user: users })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date())))
    .limit(1);

  if (!rows[0]) return undefined;

  getDb()
    .update(userSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(userSessions.tokenHash, tokenHash))
    .catch((err) => {
      console.error("[users] update session lastSeenAt failed", err);
    });

  return rows[0].user;
}

export async function deleteUserSession(tokenHash: string): Promise<boolean> {
  const rows = await getDb()
    .delete(userSessions)
    .where(eq(userSessions.tokenHash, tokenHash))
    .returning({ tokenHash: userSessions.tokenHash });
  return rows.length > 0;
}

export async function deleteExpiredUserSessions(): Promise<number> {
  const rows = await getDb()
    .delete(userSessions)
    .where(lt(userSessions.expiresAt, new Date()))
    .returning({ tokenHash: userSessions.tokenHash });
  return rows.length;
}

export async function deleteUser(id: string): Promise<boolean> {
  const rows = await getDb().delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return rows.length > 0;
}
