import { HttpError, rateLimit, requireAdmin } from "@/lib/server/auth";
import { broadcastInfo, isAudience, isSource, sendBroadcast } from "@/lib/server/broadcast";

/**
 * Admin-only "ส่งอีเมลแจ้งเตือน" endpoint.
 *   GET  ?type=content|post|article&id=…   → recipient counts, earlier sends, preview, default subject (dialog opens)
 *   POST { type, id, audience, subject }   → sends to every recipient and returns { sent, failed, … }
 * A Route Handler (not a Server Action) because a send of a few thousand emails runs ~a minute.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function admin() {
  try {
    return await requireAdmin();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
}

function fail(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error("[email]", e);
  return json({ error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }, 500);
}

export async function GET(req: Request) {
  const a = await admin();
  if (a instanceof Response) return a;
  if (!rateLimit(`email-info:${a.id}`, 30, 60_000)) return json({ error: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);

  const q = new URL(req.url).searchParams;
  const type = q.get("type");
  const id = q.get("id") ?? "";
  if (!isSource(type)) return json({ error: "คำขอไม่ถูกต้อง" }, 400);
  try {
    return json(await broadcastInfo(type, id));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const a = await admin();
  if (a instanceof Response) return a;
  if (!rateLimit(`email-send:${a.id}`, 5, 10 * 60_000)) return json({ error: "ส่งอีเมลถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);

  let body: { type?: unknown; id?: unknown; audience?: unknown; subject?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "คำขอไม่ถูกต้อง" }, 400);
  }
  if (!isSource(body.type) || !isAudience(body.audience) || typeof body.id !== "string" || typeof body.subject !== "string") {
    return json({ error: "คำขอไม่ถูกต้อง" }, 400);
  }
  try {
    return json({ ok: true, ...(await sendBroadcast(a.id, { type: body.type, id: body.id, audience: body.audience, subject: body.subject })) });
  } catch (e) {
    return fail(e);
  }
}
