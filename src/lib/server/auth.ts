import "server-only";
import { cache } from "react";
import { adminDb, userDb } from "@/lib/supabase/clients";
import type { Profile, ThemePref, Viewer } from "@/lib/types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type ProfileRow = Omit<Profile, "email"> & {
  subscriptions: { expires_at: string | null; member_no: number | null } | null;
};

/** The single membership rule: expires_at > now(). Never store an "active" flag. */
export function isActiveUntil(expiresAt: string | null | undefined, now = Date.now()) {
  return !!expiresAt && new Date(expiresAt).getTime() > now;
}

export async function isMemberUser(userId: string | null | undefined) {
  if (!userId) return false;
  const { data } = await adminDb().from("subscriptions").select("expires_at").eq("user_id", userId).maybeSingle();
  return isActiveUntil(data?.expires_at);
}

/** Signed-in visitor (Supabase Auth session) + their profile and membership. Once per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await userDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await adminDb()
    .from("profiles")
    .select("id, display_name, avatar_url, role, is_banned, autoplay, theme, save_history, created_at, subscriptions(expires_at, member_no)")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();
  if (!data) return null;
  const isAdmin = data.role === "admin";
  const expires = data.subscriptions?.expires_at ?? null;
  return {
    id: data.id,
    email: user.email ?? "",
    display_name: data.display_name || (user.email ?? "").split("@")[0],
    avatar_url: data.avatar_url,
    role: data.role,
    is_admin: isAdmin,
    is_member: isAdmin || isActiveUntil(expires),
    expires_at: expires,
    autoplay: data.autoplay,
    theme: data.theme as ThemePref,
    is_banned: data.is_banned,
    save_history: data.save_history,
    member_no: data.subscriptions?.member_no ?? null,
  };
});

export async function requireUser() {
  const v = await getViewer();
  if (!v) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  if (v.is_banned) throw new HttpError(403, "บัญชีนี้ถูกระงับการใช้งาน");
  return v;
}

/** Server-side admin gate for Studio pages, actions and APIs. */
export async function requireAdmin() {
  const v = await getViewer();
  if (!v?.is_admin) throw new HttpError(403, "ไม่มีสิทธิ์เข้าถึง");
  return v;
}

/**
 * Sliding-window rate limit, per server instance. Good enough for 100–1,000 members;
 * move to a shared store (e.g. Upstash) if the site runs on many instances.
 */
const hitsByKey = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    hitsByKey.set(key, hits);
    return false;
  }
  hits.push(now);
  hitsByKey.set(key, hits);
  return true;
}

/**
 * Demo mode (one-click sign-in as sample accounts, shown on the login page) must be
 * switched on explicitly. A missing or mistyped env var keeps it OFF — fail closed.
 */
export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE === "true";
