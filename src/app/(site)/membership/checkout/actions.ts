"use server";

import { HttpError, requireUser } from "@/lib/server/auth";
import { startCheckout } from "@/lib/server/payments";
import { isCheckoutMethod, isPlanCode } from "@/lib/plans";

export type StartCheckoutResult = { ok: true; url: string; external: boolean } | { ok: false; error: string };

function safePath(v: unknown) {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && v.length < 500 ? v : undefined;
}

/** Everything is re-validated here — the browser only suggests a plan and a method. */
export async function startCheckoutAction(plan: string, method: string, from?: string): Promise<StartCheckoutResult> {
  try {
    const viewer = await requireUser();
    if (!isPlanCode(plan) || !isCheckoutMethod(method)) return { ok: false, error: "เลือกแพ็กเกจและช่องทางชำระเงินอีกครั้ง" };
    const r = await startCheckout({ userId: viewer.id, plan, method, from: safePath(from) });
    return r.ok ? { ok: true, url: r.url, external: r.external } : { ok: false, error: r.error };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
  }
}
