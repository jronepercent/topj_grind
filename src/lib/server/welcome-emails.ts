import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { emailConfigured, sendEmails, siteUrl, unsubscribePostUrl, unsubscribeUrl } from "./email";
import { isActiveUntil } from "./auth";
import { pathFor, WELCOME_LAUNCH_MS } from "./onboarding";
import { contentHref } from "@/lib/format";
import { isStage, type OnboardingStage } from "@/lib/onboarding";
import { welcomeCopy, type WelcomeCopy, type WelcomeStep, type WelcomeTarget } from "@/lib/welcome-copy";

/** Welcome sequence (day 0 / 1 / 3 / 7). Copy: src/lib/welcome-copy.ts. Log + schedule: migration 0020 (welcome_emails, welcome_due()). */

const C = { bg: "#0A0A0B", card: "#141416", border: "#26262A", text: "#F5F5F7", muted: "#A1A1A6", accent: "#ff4d2e" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans Thai',Tahoma,sans-serif";
const siteLabel = () => siteUrl().replace(/^https?:\/\//, "");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const httpUrl = (u: string | null | undefined) => (u && /^https?:\/\/\S+$/i.test(u) ? u : null);

export interface WelcomeLinks {
  cta: string;
  secondary?: string;
}

/** Letter-style email: no cover image, one accent button, optional small text link. */
export function renderWelcomeEmail(copy: WelcomeCopy, o: { name: string; links: WelcomeLinks; unsubscribeUrl: string }) {
  const cta = httpUrl(o.links.cta) ?? siteUrl("/welcome");
  const second = copy.secondary ? httpUrl(o.links.secondary) : null;
  const unsub = httpUrl(o.unsubscribeUrl) ?? siteUrl();
  const footer = "คุณได้รับอีเมลนี้เพราะเพิ่งสมัครบัญชีที่ TOPJ_GRIND";

  const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};color:${C.text};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(copy.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-size:18px;font-weight:700;letter-spacing:0.02em;color:${C.text};">TOPJ<span style="color:${C.accent};">_</span>GRIND</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:28px 24px 30px;">
<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:${C.text};">สวัสดีครับ ${esc(o.name)}</p>
${copy.body.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.8;color:${C.text};">${esc(p)}</p>`).join("\n")}
<p style="margin:24px 0 0;"><a href="${esc(cta)}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 30px;border-radius:999px;">${esc(copy.cta.label)}</a></p>
${second && copy.secondary ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;"><a href="${esc(second)}" style="color:${C.muted};text-decoration:underline;">${esc(copy.secondary.label)}</a></p>` : ""}
<p style="margin:28px 0 0;font-size:16px;line-height:1.7;color:${C.text};">JR</p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.7;color:${C.muted};">
${esc(footer)}<br>
<a href="${esc(unsub)}" style="color:${C.muted};text-decoration:underline;">ยกเลิกรับอีเมล</a> · <a href="${esc(siteUrl())}" style="color:${C.muted};text-decoration:underline;">${esc(siteLabel())}</a>
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `สวัสดีครับ ${o.name}`,
    "",
    ...copy.body.flatMap((p) => [p, ""]),
    `${copy.cta.label}: ${cta}`,
    ...(second && copy.secondary ? ["", `${copy.secondary.label}: ${second}`] : []),
    "",
    "JR",
    "",
    "--",
    footer,
    `ยกเลิกรับอีเมล: ${unsub}`,
    siteUrl(),
  ].join("\n");

  return { html, text };
}

// ───────────────────────── Sending ─────────────────────────
export type WelcomeResult = "sent" | "skipped" | "failed";

interface Recipient {
  userId: string;
  email: string;
  name: string;
  stage: OnboardingStage | null;
  isMember: boolean;
}

/** clipN = Nth clip of the person's path; falls back to /welcome when the path is short or empty. */
async function resolveLinks(copy: WelcomeCopy, stage: OnboardingStage | null): Promise<WelcomeLinks> {
  const clips = stage ? await pathFor(stage).catch(() => []) : [];
  const resolve = (t: WelcomeTarget): string => {
    switch (t) {
      case "clip1":
      case "clip2":
      case "clip3": {
        const c = clips[Number(t.slice(4)) - 1];
        return siteUrl(c ? contentHref(c) : "/welcome");
      }
      case "community":
        return siteUrl("/community");
      case "membership":
        return siteUrl("/membership");
      default:
        return siteUrl("/welcome");
    }
  };
  return { cta: resolve(copy.cta.target), secondary: copy.secondary ? resolve(copy.secondary.target) : undefined };
}

/** Insert the log row, send, and remove the row again if sending failed (so the next run retries). */
async function deliver(r: Recipient, step: WelcomeStep, deadlineMs: number): Promise<WelcomeResult> {
  const db = adminDb();
  const { data: inserted, error } = await db
    .from("welcome_emails")
    .upsert({ user_id: r.userId, step }, { onConflict: "user_id,step", ignoreDuplicates: true })
    .select("user_id");
  if (error) {
    console.error("[welcome] log insert:", error.message); // also when migration 0020 is not applied yet
    return "failed";
  }
  if (!inserted?.length) return "skipped"; // already sent

  const undo = () => db.from("welcome_emails").delete().eq("user_id", r.userId).eq("step", step);
  try {
    const copy = welcomeCopy(step, r.stage, r.isMember);
    const links = await resolveLinks(copy, r.stage);
    const { html, text } = renderWelcomeEmail(copy, { name: r.name, links, unsubscribeUrl: unsubscribeUrl(r.userId) });
    const res = await sendEmails([{ to: r.email, subject: copy.subject, html, text, unsubscribe: unsubscribePostUrl(r.userId) }], {
      idempotencyPrefix: `welcome-${r.userId}-${step}`,
      deadlineMs,
    });
    if (res.sent === 1) return "sent";
    console.error(`[welcome] send ${step} failed:`, res.error);
    await undo();
    return "failed";
  } catch (e) {
    console.error("[welcome] send error:", e);
    await undo();
    return "failed";
  }
}

/**
 * Send one welcome step to one person. Never throws. Skips (without a log row) when email is not configured, the email is
 * unconfirmed, the person opted out or is banned, or (day 0 only) the account is from before launch.
 */
export async function sendWelcomeStep(userId: string, step: WelcomeStep): Promise<WelcomeResult> {
  try {
    if (!emailConfigured()) return "skipped";
    const db = adminDb();
    const [{ data: au }, { data: p }, { data: sub }] = await Promise.all([
      db.auth.admin.getUserById(userId),
      db.from("profiles").select("display_name, onboarding_stage, is_banned, email_updates").eq("id", userId).maybeSingle(),
      db.from("subscriptions").select("expires_at").eq("user_id", userId).maybeSingle(),
    ]);
    const u = au.user;
    if (!u?.email || !u.email_confirmed_at || !p || p.is_banned || p.email_updates === false) return "skipped";
    if (step === 0 && new Date(u.created_at).getTime() < WELCOME_LAUNCH_MS) return "skipped";
    return await deliver(
      {
        userId,
        email: u.email,
        name: String(p.display_name || "").trim() || u.email.split("@")[0],
        stage: isStage(p.onboarding_stage) ? p.onboarding_stage : null,
        isMember: isActiveUntil(sub?.expires_at),
      },
      step,
      Date.now() + 20_000,
    );
  } catch (e) {
    console.error("[welcome] sendWelcomeStep:", e);
    return "failed";
  }
}

export interface WelcomeDueRow {
  user_id: string;
  email: string;
  display_name: string;
  stage: string | null;
  is_member: boolean;
  step: number;
}

/** Cron helper: rows come from welcome_due() (already filtered), sent one by one until the deadline. */
export async function sendWelcomeBatch(rows: WelcomeDueRow[], deadlineMs: number) {
  const out = { due: rows.length, sent: 0, skipped: 0, failed: 0, timedOut: 0 };
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() > deadlineMs) {
      out.timedOut = rows.length - i;
      break;
    }
    const r = rows[i];
    if (![0, 1, 3, 7].includes(r.step)) {
      out.skipped++;
      continue;
    }
    const res = await deliver(
      { userId: r.user_id, email: r.email, name: r.display_name, stage: isStage(r.stage) ? r.stage : null, isMember: r.is_member },
      r.step as WelcomeStep,
      deadlineMs,
    );
    out[res === "sent" ? "sent" : res === "skipped" ? "skipped" : "failed"]++;
  }
  return out;
}
