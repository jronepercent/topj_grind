import "server-only";
import { cookies } from "next/headers";
import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { cache } from "react";
import { db, commit, nowIso } from "./store";
import type { Profile, Viewer } from "@/lib/types";

export const SESSION_COOKIE = "tg_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const test = scryptSync(pw, salt, 32);
  const buf = Buffer.from(hash, "hex");
  return buf.length === test.length && timingSafeEqual(buf, test);
}

/** The single membership rule: expires_at > now(). Never store an "active" flag. */
export function isMemberUser(userId: string | null | undefined, now = Date.now()) {
  if (!userId) return false;
  const sub = db().subscriptions.find((s) => s.user_id === userId);
  return !!sub?.expires_at && new Date(sub.expires_at).getTime() > now;
}

export function toViewer(p: Profile): Viewer {
  const sub = db().subscriptions.find((s) => s.user_id === p.id);
  const isAdmin = p.role === "admin";
  return {
    id: p.id,
    email: p.email,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    role: p.role,
    is_admin: isAdmin,
    is_member: isAdmin || isMemberUser(p.id),
    expires_at: sub?.expires_at ?? null,
    autoplay: p.autoplay,
    theme: p.theme,
  };
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = db().sessions.find((x) => x.token === token);
  if (!s) return null;
  const p = db().profiles.find((x) => x.id === s.user_id);
  if (!p) return null;
  return toViewer(p);
});

export async function createSession(userId: string) {
  const token = randomBytes(24).toString("hex");
  db().sessions.push({ token, user_id: userId, created_at: nowIso() });
  commit();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    db().sessions = db().sessions.filter((s) => s.token !== token);
    commit();
  }
  jar.delete(SESSION_COOKIE);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser() {
  const v = await getViewer();
  if (!v) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const p = db().profiles.find((x) => x.id === v.id);
  if (p?.is_banned) throw new HttpError(403, "บัญชีนี้ถูกระงับการใช้งาน");
  return v;
}

/** Server-side admin gate for Studio pages, actions and APIs. */
export async function requireAdmin() {
  const v = await getViewer();
  if (!v?.is_admin) throw new HttpError(403, "ไม่มีสิทธิ์เข้าถึง");
  return v;
}

/** Sliding-window rate limit. Returns true when allowed. */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const store = db().rate_limits;
  const hits = (store[key] ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    store[key] = hits;
    return false;
  }
  hits.push(now);
  store[key] = hits;
  return true;
}

/**
 * Demo mode (one-click sign-in as any role, magic links shown on screen) must be
 * switched on explicitly. A missing or mistyped env var keeps it OFF — fail closed.
 */
export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";
