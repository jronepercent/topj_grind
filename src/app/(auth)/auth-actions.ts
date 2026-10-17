"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userDb } from "@/lib/supabase/clients";
import { getViewer, isDemoMode, rateLimit } from "@/lib/server/auth";
import { DEMO_ACCOUNTS, demoPassword, type DemoRole } from "@/lib/server/demo-accounts";

export type AuthState = { error?: string; info?: string; devLink?: string } | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Where links in Supabase emails come back to (must be in Supabase → Auth → Redirect URLs). */
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
}

function thaiAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (m.includes("email not confirmed")) return "ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ในอีเมลที่เราส่งไปก่อน";
  if (m.includes("already registered") || m.includes("already been registered")) return "อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบ";
  if (m.includes("rate limit") || m.includes("too many")) return "ส่งคำขอถี่เกินไป รอสักครู่แล้วลองใหม่";
  if (m.includes("password")) return "รหัสผ่านไม่ผ่านเงื่อนไข (อย่างน้อย 8 ตัวอักษร)";
  return "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง";
}

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!rateLimit(`login:${email}`, 8, 10 * 60_000)) return { error: "ลองเข้าสู่ระบบหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่" };
  const supabase = await userDb();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: thaiAuthError(error.message) };
  redirect(safeNext(form.get("next")));
}

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 50);
  if (!name) return { error: "กรุณาใส่ชื่อที่แสดง" };
  if (!emailOk(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (password.length < 8) return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  if (!rateLimit(`signup:${email}`, 5, 10 * 60_000)) return { error: "ส่งคำขอถี่เกินไป รอสักครู่" };
  const next = safeNext(form.get("next"));
  const supabase = await userDb();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name }, emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: thaiAuthError(error.message) };
  if (data.session) redirect(next); // email confirmation is off
  return { info: `ส่งลิงก์ยืนยันไปที่ ${email} แล้ว เปิดอีเมลแล้วกดลิงก์เพื่อเริ่มใช้งาน` };
}

export async function magicLinkAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (!rateLimit(`magic:${email}`, 5, 10 * 60_000)) return { error: "ขอลิงก์ถี่เกินไป รอสักครู่" };
  const next = safeNext(form.get("next"));
  const supabase = await userDb();
  await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  // Same answer whether or not the account exists, so emails can't be probed.
  return { info: "ถ้าอีเมลนี้มีบัญชี เราได้ส่งลิงก์เข้าสู่ระบบไปแล้ว" };
}

export async function requestResetAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (!rateLimit(`reset:${email}`, 5, 10 * 60_000)) return { error: "ขอลิงก์ถี่เกินไป รอสักครู่" };
  const supabase = await userDb();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent("/reset-password?token=recovery")}`,
  });
  return { info: "ถ้าอีเมลนี้มีบัญชี เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว" };
}

/** Second step of reset: the recovery link already signed the person in via /auth/callback. */
export async function resetPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  const supabase = await userDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ลิงก์หมดอายุแล้ว ขอลิงก์ใหม่อีกครั้ง" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: thaiAuthError(error.message) };
  redirect("/account");
}

export async function changePasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const v = await getViewer();
  if (!v) return { error: "กรุณาเข้าสู่ระบบ" };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  if (next.length < 8) return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" };
  const supabase = await userDb();
  // Re-check the current password before changing it.
  const check = await supabase.auth.signInWithPassword({ email: v.email, password: current });
  if (check.error) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: thaiAuthError(error.message) };
  return { info: "เปลี่ยนรหัสผ่านแล้ว" };
}

export async function logoutAction() {
  const supabase = await userDb();
  await supabase.auth.signOut();
}

/** Demo mode only: one-click sign-in as a sample account to review each permission level. */
export async function demoLoginAction(role: DemoRole | "guest") {
  if (!isDemoMode()) return;
  const supabase = await userDb();
  if (role === "guest") {
    await supabase.auth.signOut();
    return;
  }
  const password = demoPassword();
  if (!password) return;
  await supabase.auth.signInWithPassword({ email: DEMO_ACCOUNTS[role], password });
}
