"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { createSession, destroySession, isDemoMode, rateLimit, verifyPassword } from "@/lib/server/auth";
import { db, commit, nowIso } from "@/lib/server/store";
import { hashPassword, DEMO_ACCOUNTS } from "@/lib/server/seed";

export type AuthState = { error?: string; info?: string; devLink?: string } | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!rateLimit(`login:${email}`, 8, 10 * 60_000)) return { error: "ลองเข้าสู่ระบบหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่" };
  const p = db().profiles.find((x) => x.email.toLowerCase() === email);
  const cred = p && db().credentials.find((c) => c.user_id === p.id);
  if (!p || !cred || !verifyPassword(password, cred.password_hash)) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  await createSession(p.id);
  redirect(safeNext(form.get("next")));
}

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "กรุณาใส่ชื่อที่แสดง" };
  if (!emailOk(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (password.length < 8) return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  if (db().profiles.some((x) => x.email.toLowerCase() === email)) return { error: "อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบ" };
  const id = crypto.randomUUID();
  db().profiles.push({
    id,
    email,
    display_name: name.slice(0, 50),
    avatar_url: null,
    role: "user",
    is_banned: false,
    autoplay: true,
    theme: "dark",
    save_history: true,
    created_at: nowIso(),
  });
  db().credentials.push({ user_id: id, password_hash: hashPassword(password) });
  db().subscriptions.push({ user_id: id, expires_at: null, first_paid_at: null, updated_at: nowIso() });
  commit();
  await createSession(id);
  redirect(safeNext(form.get("next")));
}

function issueLink(email: string, purpose: "login" | "reset", next: string) {
  const token = randomBytes(24).toString("hex");
  db().magic_links.push({ token, email, purpose, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  commit();
  const path = purpose === "login" ? `/auth/magic?token=${token}&next=${encodeURIComponent(next)}` : `/reset-password?token=${token}`;
  // Real deployment: Supabase Auth sends this by email. Demo mode shows it on screen.
  return path;
}

export async function magicLinkAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (!rateLimit(`magic:${email}`, 5, 10 * 60_000)) return { error: "ขอลิงก์ถี่เกินไป รอสักครู่" };
  const exists = db().profiles.some((x) => x.email.toLowerCase() === email);
  const info = "ถ้าอีเมลนี้มีบัญชี เราได้ส่งลิงก์เข้าสู่ระบบไปแล้ว (หมดอายุใน 15 นาที)";
  if (!exists) return { info };
  const link = issueLink(email, "login", safeNext(form.get("next")));
  return { info, devLink: isDemoMode() ? link : undefined };
}

export async function requestResetAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  const info = "ถ้าอีเมลนี้มีบัญชี เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว";
  if (!db().profiles.some((x) => x.email.toLowerCase() === email)) return { info };
  const link = issueLink(email, "reset", "/");
  return { info, devLink: isDemoMode() ? link : undefined };
}

export async function resetPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  const link = db().magic_links.find((m) => m.token === token && m.purpose === "reset");
  if (!link || new Date(link.expires_at).getTime() < Date.now()) return { error: "ลิงก์หมดอายุแล้ว ขอลิงก์ใหม่อีกครั้ง" };
  const p = db().profiles.find((x) => x.email.toLowerCase() === link.email);
  if (!p) return { error: "ไม่พบบัญชี" };
  const cred = db().credentials.find((c) => c.user_id === p.id);
  if (cred) cred.password_hash = hashPassword(password);
  db().magic_links = db().magic_links.filter((m) => m.token !== token);
  commit();
  await createSession(p.id);
  redirect("/account");
}

export async function changePasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const { getViewer } = await import("@/lib/server/auth");
  const v = await getViewer();
  if (!v) return { error: "กรุณาเข้าสู่ระบบ" };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const cred = db().credentials.find((c) => c.user_id === v.id);
  if (!cred || !verifyPassword(current, cred.password_hash)) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  if (next.length < 8) return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" };
  cred.password_hash = hashPassword(next);
  commit();
  return { info: "เปลี่ยนรหัสผ่านแล้ว" };
}

export async function logoutAction() {
  await destroySession();
}

/** Demo mode only: one-click sign-in as a sample account to review each permission level. */
export async function demoLoginAction(role: keyof typeof DEMO_ACCOUNTS | "guest") {
  if (!isDemoMode()) return;
  if (role === "guest") {
    await destroySession();
    return;
  }
  const p = db().profiles.find((x) => x.email === DEMO_ACCOUNTS[role]);
  if (p) await createSession(p.id);
}
