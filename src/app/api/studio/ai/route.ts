import Anthropic from "@anthropic-ai/sdk";
import { HttpError, rateLimit, requireAdmin } from "@/lib/server/auth";
import { AI_ERROR_MARKER } from "@/lib/community";
import {
  AI_INPUT_LIMITS,
  AI_MODEL,
  LENGTHS,
  META_SCHEMA,
  SYSTEM_PROMPT,
  draftPrompt,
  editPrompt,
  metaPrompt,
  type DraftLength,
  type EditAction,
} from "@/lib/server/ai-prompts";

/**
 * Admin-only AI writing endpoint for the article editor ("เขียนด้วย AI").
 *   mode: "draft"                  → streams a full Markdown article (text/plain)
 *   mode: "polish"|"shorten"|"expand" → streams the revised article
 *   mode: "meta"                   → JSON { title, excerpt } suggestion
 * The text only goes into the editor; nothing here saves or publishes.
 * Streamed errors end with the marker "\n\n[[AI_ERROR]] message" so the client can show them.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a 2,000-word draft with adaptive thinking can run a few minutes

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

type Body = {
  mode?: string;
  topic?: string;
  points?: string;
  audience?: string;
  length?: string;
  body?: string;
  title?: string;
};

function explain(e: unknown): { status: number; message: string } {
  if (e instanceof Anthropic.RateLimitError) return { status: 429, message: "AI ถูกใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่" };
  if (e instanceof Anthropic.AuthenticationError) return { status: 500, message: "ANTHROPIC_API_KEY ไม่ถูกต้อง ตรวจสอบค่าที่ตั้งไว้" };
  if (e instanceof Anthropic.PermissionDeniedError) return { status: 500, message: "API key นี้ไม่มีสิทธิ์ใช้โมเดลนี้" };
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, message: "เชื่อมต่อ AI ไม่ได้ ลองใหม่อีกครั้ง" };
  if (e instanceof Anthropic.APIError) {
    console.error("[ai]", e.status, e.message);
    return { status: 502, message: "AI ตอบกลับผิดพลาด ลองใหม่อีกครั้ง" };
  }
  console.error("[ai]", e);
  return { status: 500, message: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
}

export async function POST(req: Request) {
  let adminId: string;
  try {
    adminId = (await requireAdmin()).id;
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY", code: "no_key" }, 503);
  if (!rateLimit(`ai:${adminId}`, 8, 60_000)) return json({ error: "ใช้ AI ถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);

  let input: Body;
  try {
    input = (await req.json()) as Body;
  } catch {
    return json({ error: "คำขอไม่ถูกต้อง" }, 400);
  }
  const mode = input.mode;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

  let userPrompt: string;
  let effort: "medium" | "high" = "high";
  if (mode === "draft") {
    const topic = str(input.topic, AI_INPUT_LIMITS.topic).trim();
    if (!topic) return json({ error: "กรุณาใส่หัวข้อ" }, 400);
    const length = (input.length && input.length in LENGTHS ? input.length : "medium") as DraftLength;
    userPrompt = draftPrompt({ topic, points: str(input.points, AI_INPUT_LIMITS.points), length, audience: str(input.audience, AI_INPUT_LIMITS.audience) });
  } else if (mode === "polish" || mode === "shorten" || mode === "expand" || mode === "meta") {
    const body = str(input.body, AI_INPUT_LIMITS.body).trim();
    if (body.length < 40) return json({ error: "ยังไม่มีเนื้อหาบทความ เขียนหรือร่างก่อน" }, 400);
    if (mode === "meta") userPrompt = metaPrompt(body, str(input.title, 200));
    else {
      userPrompt = editPrompt(mode as EditAction, body);
      effort = mode === "expand" ? "high" : "medium";
    }
  } else return json({ error: "คำขอไม่ถูกต้อง" }, 400);

  const client = new Anthropic(); // ANTHROPIC_API_KEY from the environment, server only

  // ── title + excerpt suggestion: one short JSON reply ──
  if (mode === "meta") {
    try {
      const res = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        output_config: { effort: "low", format: { type: "json_schema", schema: META_SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "user", content: userPrompt }],
      });
      if (res.stop_reason === "refusal") return json({ error: "AI ปฏิเสธคำขอนี้" }, 422);
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = JSON.parse(text) as { title?: string; excerpt?: string };
      return json({ title: String(parsed.title ?? "").slice(0, 200), excerpt: String(parsed.excerpt ?? "").slice(0, 400) });
    } catch (e) {
      const x = explain(e);
      return json({ error: x.message }, x.status);
    }
  }

  // ── streamed article text ──
  // server-side fallback: if a safety classifier declines, the request is retried on a fallback model
  const stream = client.beta.messages.stream(
    {
      model: AI_MODEL,
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: userPrompt }],
    },
    { signal: req.signal },
  );

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safe = (fn: () => void) => {
        if (!closed) fn();
      };
      stream.on("text", (delta) => safe(() => controller.enqueue(enc.encode(delta))));
      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") safe(() => controller.enqueue(enc.encode(`\n\n${AI_ERROR_MARKER} AI ปฏิเสธคำขอนี้ ลองปรับหัวข้อแล้วลองใหม่`)));
        else if (final.stop_reason === "max_tokens") safe(() => controller.enqueue(enc.encode(`\n\n${AI_ERROR_MARKER} บทความยาวเกินขีดจำกัด ถูกตัดตอนท้าย`)));
      } catch (e) {
        if (!req.signal.aborted) safe(() => controller.enqueue(enc.encode(`\n\n${AI_ERROR_MARKER} ${explain(e).message}`)));
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
