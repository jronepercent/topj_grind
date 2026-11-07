import "server-only";
import { after } from "next/server";
import { adminDb } from "@/lib/supabase/clients";
import { emailConfigured, sendEmails, siteUrl, unsubscribePostUrl, unsubscribeUrl } from "./email";

/**
 * "มีคนตอบคุณในชุมชน" — an email that follows the in-site notification when someone comments on your post / article
 * thread or replies to your comment, so people who are not on the site come back.
 *  - Respects profiles.email_updates (same switch as every other non-receipt email) and skips banned / unconfirmed accounts.
 *  - At most one email per thread until the person comes back: skipped while an earlier unread comment/reply
 *    notification for the same link (last 24 h) exists. Reading it on the site resets this.
 *  - Resend Idempotency-Key = the notification id, so a retry can never send twice.
 */

const BUDGET_MS = 4_000;
const DEDUP_MS = 24 * 3_600_000;
const QUOTE_MAX = 300;

const C = { bg: "#0A0A0B", card: "#141416", border: "#26262A", text: "#F5F5F7", muted: "#A1A1A6", accent: "#ff4d2e" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans Thai',Tahoma,sans-serif";
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const siteLabel = () => siteUrl().replace(/^https?:\/\//, "");
const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};

export interface ReplyEmailInput {
  /** The notification row just inserted for the recipient. */
  notificationId: string;
  recipientId: string;
  kind: "reply" | "comment";
  /** "JR" for admins, otherwise the commenter's display name. */
  actorName: string;
  /** The new comment text. */
  body: string;
  /** Site path with hash, e.g. /community/posts/<id>#comments */
  link: string;
  /** "โพสต์" | "บทความ" */
  where: "โพสต์" | "บทความ";
  /** Article title or the start of the post caption. */
  label: string;
}

export const replySubject = (i: Pick<ReplyEmailInput, "kind" | "actorName">) =>
  i.kind === "reply" ? `${i.actorName} ตอบกลับความคิดเห็นของคุณ` : `${i.actorName} แสดงความคิดเห็นในโพสต์ของคุณ`;

/** /path#hash → absolute URL with utm params placed before the hash. */
export function trackedUrl(link: string) {
  const [path, hash] = link.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return siteUrl(`${path}${sep}utm_source=email&utm_medium=email&utm_campaign=reply${hash ? `#${hash}` : ""}`);
}

export function renderReplyEmail(i: ReplyEmailInput, o: { name: string; unsubscribeUrl: string }) {
  const subject = replySubject(i);
  const url = trackedUrl(i.link);
  // keep the commenter's line breaks (shown with white-space:pre-line), just tidy runs of blank lines
  const tidy = i.body.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const quote = tidy.length > QUOTE_MAX ? `${tidy.slice(0, QUOTE_MAX).trimEnd()}…` : tidy;
  const context = i.label ? `ใน${i.where}: ${clip(i.label, 80)}` : "";
  const footer = "คุณได้รับอีเมลนี้เพราะมีคนตอบคุณในชุมชน TOPJ_GRIND";

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.text};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(clip(i.body, 90))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-size:18px;font-weight:700;letter-spacing:0.02em;color:${C.text};">TOPJ<span style="color:${C.accent};">_</span>GRIND</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:24px 24px 28px;">
<p style="margin:0 0 6px;font-size:13px;color:${C.muted};">สวัสดี ${esc(o.name)}</p>
<h1 style="margin:0 0 ${context ? "6" : "16"}px;font-size:20px;line-height:1.45;font-weight:700;color:${C.text};">${esc(subject)}</h1>
${context ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${C.muted};">${esc(context)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>
<td width="3" style="background:${C.accent};border-radius:2px;"></td>
<td style="padding:4px 0 4px 14px;font-size:16px;line-height:1.75;color:${C.text};white-space:pre-line;">${esc(quote)}</td>
</tr></table>
<a href="${esc(url)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 28px;border-radius:999px;">ไปตอบกลับ</a>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.7;color:${C.muted};">
${esc(footer)}<br>
<a href="${esc(o.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline;">ยกเลิกรับอีเมล</a> · <a href="${esc(siteUrl())}" style="color:${C.muted};text-decoration:underline;">${esc(siteLabel())}</a>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `สวัสดี ${o.name}`,
    "",
    subject,
    ...(context ? [context] : []),
    "",
    `"${quote}"`,
    "",
    `ไปตอบกลับ: ${url}`,
    "",
    "--",
    footer,
    `ยกเลิกรับอีเมล: ${o.unsubscribeUrl}`,
    siteUrl(),
  ].join("\n");

  return { subject, html, text };
}

export type ReplyEmailResult = "sent" | "skipped" | "failed";

/** Never throws; gives up after ~4 s. A mail problem must never break or slow down posting a comment. */
export async function sendReplyEmail(i: ReplyEmailInput): Promise<ReplyEmailResult> {
  try {
    if (!emailConfigured()) return "skipped";
    const db = adminDb();
    const since = new Date(Date.now() - DEDUP_MS).toISOString();
    const [{ data: au }, { data: p }, { count: pending }] = await Promise.all([
      db.auth.admin.getUserById(i.recipientId),
      db.from("profiles").select("display_name, is_banned, email_updates").eq("id", i.recipientId).maybeSingle(),
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", i.recipientId)
        .eq("link", i.link)
        .in("type", ["comment", "reply"])
        .is("read_at", null)
        .gte("created_at", since)
        .neq("id", i.notificationId),
    ]);
    const u = au.user;
    if (!u?.email || !u.email_confirmed_at || !p || p.is_banned || p.email_updates === false) return "skipped";
    if ((pending ?? 0) > 0) return "skipped"; // already emailed about this thread and they have not been back yet

    const name = String(p.display_name || "").trim() || u.email.split("@")[0];
    const { subject, html, text } = renderReplyEmail(i, { name, unsubscribeUrl: unsubscribeUrl(i.recipientId) });
    const send = sendEmails([{ to: u.email, subject, html, text, unsubscribe: unsubscribePostUrl(i.recipientId) }], {
      idempotencyPrefix: `reply-${i.notificationId}`,
      deadlineMs: Date.now() + BUDGET_MS,
    });
    const r = await Promise.race([send, new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS))]);
    if (!r) {
      console.warn(`[reply-email] timed out (${i.notificationId})`);
      return "failed";
    }
    if (r.failed) {
      console.warn(`[reply-email] ${r.error ?? "failed"} (${i.notificationId})`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[reply-email] error", i.notificationId, e);
    return "failed";
  }
}

/** Send after the response so the commenter never waits for Resend; fire-and-forget outside a request. */
export function queueReplyEmail(i: ReplyEmailInput): void {
  try {
    after(() => sendReplyEmail(i));
  } catch {
    void sendReplyEmail(i);
  }
}
