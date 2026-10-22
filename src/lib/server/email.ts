import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Notification emails (Studio → ส่งอีเมลแจ้งเตือน), sent through Resend's HTTP API — no SDK.
 * Env: RESEND_API_KEY, EMAIL_FROM ("TOPJ_GRIND <updates@topjgrind.com>"), EMAIL_UNSUBSCRIBE_SECRET.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com").replace(/\/+$/, "");
const REQUIRED_ENV = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_UNSUBSCRIBE_SECRET"] as const;

export const siteUrl = (path = "") => `${SITE}${path}`;

/** Names of the env vars that are not set yet (empty = ready to send). */
export function missingEmailEnv(): string[] {
  return REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
}
export const emailConfigured = () => missingEmailEnv().length === 0;

// ───────────────────────── Unsubscribe token ─────────────────────────
// Stateless: the link carries HMAC(user id), so nothing is stored and nobody can unsubscribe someone else.
function unsubscribeToken(userId: string) {
  return createHmac("sha256", process.env.EMAIL_UNSUBSCRIBE_SECRET ?? "").update(`unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string) {
  if (!process.env.EMAIL_UNSUBSCRIBE_SECRET || !userId || !token) return false;
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

const unsubscribeQuery = (userId: string) => `u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
/** The page linked in the email body (shows a confirm button). */
export const unsubscribeUrl = (userId: string) => `${SITE}/unsubscribe?${unsubscribeQuery(userId)}`;
/** The List-Unsubscribe header target: mail clients POST here (RFC 8058), so it must be the API route, not the page. */
export const unsubscribePostUrl = (userId: string) => `${SITE}/api/email/unsubscribe?${unsubscribeQuery(userId)}`;

// ───────────────────────── Template ─────────────────────────
export interface BroadcastItem {
  /** "คลิปใหม่" · "พอดแคสต์ตอนใหม่" · "บทความใหม่" · "โพสต์ใหม่ในชุมชน" */
  kindLabel: string;
  /** Call-to-action button text */
  cta: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  /** Absolute URL of the item */
  url: string;
  membersOnly: boolean;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const httpUrl = (u: string | null | undefined) => (u && /^https?:\/\/\S+$/i.test(u) ? u : null);

const C = { bg: "#0A0A0B", card: "#141416", border: "#26262A", text: "#F5F5F7", muted: "#A1A1A6", accent: "#ff4d2e", gold: "#E8C77A" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans Thai',Tahoma,sans-serif";

export function renderBroadcastEmail(item: BroadcastItem, opts: { name: string; unsubscribeUrl: string }) {
  const cover = httpUrl(item.coverUrl);
  const url = httpUrl(item.url) ?? SITE;
  const unsub = httpUrl(opts.unsubscribeUrl) ?? SITE;
  const preheader = item.excerpt || item.title;

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(item.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.text};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-size:18px;font-weight:700;letter-spacing:0.02em;color:${C.text};">TOPJ<span style="color:${C.accent};">_</span>GRIND</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden;">
${cover ? `<a href="${esc(url)}" style="display:block;"><img src="${esc(cover)}" alt="" width="560" style="display:block;width:100%;height:auto;border:0;"></a>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 24px 28px;">
<p style="margin:0 0 6px;font-size:13px;color:${C.muted};">สวัสดี ${esc(opts.name)}</p>
<p style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:0.04em;color:${C.accent};">${esc(item.kindLabel)}</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.4;font-weight:700;color:${C.text};">${esc(item.title)}</h1>
${item.excerpt ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:${C.muted};">${esc(item.excerpt)}</p>` : ""}
${item.membersOnly ? `<p style="margin:0 0 20px;font-size:13px;font-weight:600;color:${C.gold};">สำหรับสมาชิก</p>` : ""}
<a href="${esc(url)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:999px;">${esc(item.cta)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.7;color:${C.muted};">
คุณได้รับอีเมลนี้เพราะมีบัญชีที่ TOPJ_GRIND และเปิดรับอีเมลแจ้งเตือนคอนเทนต์ใหม่ไว้<br>
<a href="${esc(unsub)}" style="color:${C.muted};text-decoration:underline;">ยกเลิกรับอีเมลแจ้งเตือน</a> · <a href="${esc(SITE)}" style="color:${C.muted};text-decoration:underline;">${esc(SITE.replace(/^https?:\/\//, ""))}</a>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `สวัสดี ${opts.name}`,
    "",
    `${item.kindLabel}: ${item.title}`,
    item.excerpt,
    item.membersOnly ? "สำหรับสมาชิก" : "",
    "",
    `${item.cta}: ${url}`,
    "",
    "--",
    "คุณได้รับอีเมลนี้เพราะมีบัญชีที่ TOPJ_GRIND และเปิดรับอีเมลแจ้งเตือนคอนเทนต์ใหม่ไว้",
    `ยกเลิกรับอีเมลแจ้งเตือน: ${unsub}`,
    SITE,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");

  return { html, text };
}

// ───────────────────────── Sender (Resend batch API) ─────────────────────────
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Personal one-click unsubscribe URL for the List-Unsubscribe header (RFC 8058) */
  unsubscribe: string;
}

export interface SendSummary {
  sent: number;
  failed: number;
  /** First failure reason (Thai or API text), null when everything went through */
  error: string | null;
}

const BATCH_SIZE = 100; // Resend's cap per /emails/batch call
const PAUSE_MS = 600; // Resend allows 2 requests/second
const REQUEST_TIMEOUT_MS = 8_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Attempt = { ok: true } | { ok: false; retry: boolean; error: string };

async function postBatch(payload: unknown[], idempotencyKey: string): Promise<Attempt> {
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, retry: res.status === 429 || res.status >= 500, error: `Resend ${res.status}: ${body?.message ?? res.statusText}` };
  } catch (e) {
    return { ok: false, retry: true, error: `ส่งไปยัง Resend ไม่สำเร็จ: ${e instanceof Error ? e.message : "เครือข่ายผิดพลาด"}` };
  }
}

/**
 * One email per recipient (so the unsubscribe link is personal), 100 per call, ~2 calls/second.
 * A failed call is retried once (same Idempotency-Key, so a retry can never double-send). Never throws:
 * failures are counted. Stops starting new calls after `deadlineMs`; whatever was not attempted counts as failed.
 */
export async function sendEmails(messages: OutgoingEmail[], opts: { idempotencyPrefix: string; deadlineMs: number }): Promise<SendSummary> {
  const from = process.env.EMAIL_FROM ?? "";
  const out: SendSummary = { sent: 0, failed: 0, error: null };
  const fail = (n: number, reason: string) => {
    out.failed += n;
    out.error ??= reason;
  };

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    if (Date.now() > opts.deadlineMs) {
      fail(messages.length - i, "หมดเวลา: ส่งไม่ครบทุกคน ผู้รับที่เหลือยังไม่ได้อีเมล");
      break;
    }
    const payload = chunk.map((m) => ({
      from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
      headers: { "List-Unsubscribe": `<${m.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }));
    const key = `${opts.idempotencyPrefix}-${i / BATCH_SIZE}`;
    let r = await postBatch(payload, key);
    if (!r.ok && r.retry) {
      await sleep(1_500);
      r = await postBatch(payload, key);
    }
    if (r.ok) out.sent += chunk.length;
    else fail(chunk.length, r.error);
    if (i + BATCH_SIZE < messages.length) await sleep(PAUSE_MS);
  }
  return out;
}
