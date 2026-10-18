import "server-only";
import { HttpError, rateLimit } from "./auth";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** Run a Server Action body and turn HttpErrors into `{ ok: false }` results (same contract as src/app/actions.ts). */
export async function run<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message, status: e.status };
    console.error(e);
    return { ok: false, error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
  }
}

export function limit(key: string, max: number, windowMs: number) {
  if (!rateLimit(key, max, windowMs)) throw new HttpError(429, "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่");
}
