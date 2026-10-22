import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { HttpError } from "./auth";
import { emailConfigured, missingEmailEnv, renderBroadcastEmail, sendEmails, siteUrl, unsubscribePostUrl, unsubscribeUrl, type BroadcastItem, type OutgoingEmail } from "./email";
import { mdExcerpt } from "@/lib/community";
import { contentHref } from "@/lib/format";
import { excerpt } from "@/lib/richtext";

/** Studio → ส่งอีเมลแจ้งเตือน: load the item, count / list recipients, send, and log the result in email_broadcasts (migration 0015). */

export type BroadcastSource = "content" | "post" | "article";
export type BroadcastAudience = "all" | "members";

export const isSource = (v: unknown): v is BroadcastSource => v === "content" || v === "post" || v === "article";
export const isAudience = (v: unknown): v is BroadcastAudience => v === "all" || v === "members";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT_MAX = 150;
const EXCERPT_MAX = 200;
const SEND_BUDGET_MS = 40_000; // route maxDuration is 60s; leave room for the last call + bookkeeping
const PAGE = 1000; // PostgREST returns at most 1,000 rows per request

const NOT_LIVE = "ส่งได้เฉพาะรายการที่เผยแพร่แล้วและแสดงบนเว็บอยู่";
const MIGRATION_HINT = "ฐานข้อมูลยังไม่มีตารางอีเมล (ต้องรัน migration 0015 ก่อน: npm run db:migrate)";

function dbError(error: { code?: string; message: string }, what: string): never {
  // 42P01 undefined table · 42883 / PGRST202 undefined function · 42703 undefined column
  if (["42P01", "42883", "42703", "PGRST202", "PGRST205"].includes(error.code ?? "")) throw new HttpError(503, MIGRATION_HINT);
  console.error(`[broadcast] ${what}:`, error.message);
  throw new HttpError(500, "เกิดข้อผิดพลาดกับฐานข้อมูล ลองใหม่อีกครั้ง");
}

// ───────────────────────── Source item ─────────────────────────
interface Source {
  item: BroadcastItem;
  defaultSubject: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function loadSource(type: BroadcastSource, id: string): Promise<Source> {
  if (!UUID_RE.test(id)) throw new HttpError(404, "ไม่พบรายการนี้");
  const db = adminDb();
  const now = Date.now();

  if (type === "content") {
    const { data, error } = await db
      .from("content")
      .select("id, type, title, description, thumbnail_url, visibility, status, media_status, published_at, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) dbError(error, "content");
    if (!data || data.deleted_at || data.type === "short") throw new HttpError(404, "ไม่พบรายการนี้");
    const live = data.status === "published" && data.media_status === "ready" && !!data.published_at && new Date(data.published_at).getTime() <= now;
    if (!live) throw new HttpError(409, NOT_LIVE);
    const podcast = data.type === "podcast";
    const membersOnly = data.visibility === "members";
    return {
      item: {
        kindLabel: podcast ? "พอดแคสต์ตอนใหม่" : "คลิปใหม่",
        cta: podcast ? "ฟังตอนนี้" : "ดูคลิป",
        title: data.title,
        // same rule as the OG tags: a members-only description is not shown to the public
        excerpt: membersOnly ? "" : excerpt(data.description ?? "", EXCERPT_MAX),
        coverUrl: data.thumbnail_url,
        url: siteUrl(contentHref({ id: data.id, type: data.type })),
        membersOnly,
      },
      defaultSubject: clip(`${podcast ? "พอดแคสต์ตอนใหม่" : "คลิปใหม่"}: ${data.title}`, SUBJECT_MAX),
    };
  }

  const { data, error } = await db
    .from("posts")
    .select("id, kind, title, body, excerpt, cover_url, images, visibility, status, is_hidden, published_at, deleted_at")
    .eq("id", id)
    .eq("kind", type === "article" ? "article" : "community")
    .maybeSingle();
  if (error) dbError(error, "posts");
  if (!data || data.deleted_at) throw new HttpError(404, "ไม่พบรายการนี้");
  const live = data.status === "published" && !data.is_hidden && !!data.published_at && new Date(data.published_at).getTime() <= now;
  if (!live) throw new HttpError(409, NOT_LIVE);

  if (type === "article") {
    const title = data.title || "บทความใหม่";
    return {
      item: {
        kindLabel: "บทความใหม่",
        cta: "อ่านบทความ",
        title,
        excerpt: excerpt(data.excerpt || mdExcerpt(data.body ?? "", EXCERPT_MAX), EXCERPT_MAX),
        coverUrl: data.cover_url,
        url: siteUrl(`/community/articles/${data.id}`),
        membersOnly: data.visibility === "members",
      },
      defaultSubject: clip(`บทความใหม่: ${title}`, SUBJECT_MAX),
    };
  }

  const text = excerpt(data.body ?? "", EXCERPT_MAX);
  return {
    item: {
      kindLabel: "โพสต์ใหม่ในชุมชน",
      cta: "ดูโพสต์",
      title: "โพสต์ใหม่ในชุมชน TOPJ_GRIND",
      excerpt: text,
      coverUrl: (data.images as string[] | null)?.[0] ?? null,
      url: siteUrl(`/community/posts/${data.id}`),
      membersOnly: false,
    },
    defaultSubject: clip(text ? `โพสต์ใหม่ในชุมชน: ${text}` : "โพสต์ใหม่ในชุมชน TOPJ_GRIND", SUBJECT_MAX),
  };
}

// ───────────────────────── Dialog info ─────────────────────────
export interface PreviousBroadcast {
  audience: BroadcastAudience;
  subject: string;
  created_at: string;
  recipients: number;
  sent: number;
  failed: number;
}

export interface BroadcastInfo {
  configured: boolean;
  missing: string[];
  counts: { all: number; members: number };
  previous: PreviousBroadcast[];
  preview: BroadcastItem;
  defaultSubject: string;
}

export async function broadcastInfo(type: BroadcastSource, id: string): Promise<BroadcastInfo> {
  const source = await loadSource(type, id);
  const db = adminDb();
  const [counts, previous] = await Promise.all([
    db.rpc("email_recipient_counts"),
    db
      .from("email_broadcasts")
      .select("audience, subject, created_at, recipients, sent, failed")
      .eq("source_type", type)
      .eq("source_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (counts.error) dbError(counts.error, "email_recipient_counts");
  if (previous.error) dbError(previous.error, "email_broadcasts");
  const row = (counts.data as { all_count: number; members_count: number }[] | null)?.[0];
  return {
    configured: emailConfigured(),
    missing: missingEmailEnv(),
    counts: { all: row?.all_count ?? 0, members: row?.members_count ?? 0 },
    previous: (previous.data ?? []) as PreviousBroadcast[],
    preview: source.item,
    defaultSubject: source.defaultSubject,
  };
}

// ───────────────────────── Send ─────────────────────────
type Recipient = { user_id: string; email: string; display_name: string };

async function listRecipients(audience: BroadcastAudience): Promise<Recipient[]> {
  const db = adminDb();
  const all: Recipient[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.rpc("email_recipients", { p_audience: audience }).range(from, from + PAGE - 1);
    if (error) dbError(error, "email_recipients");
    const rows = (data ?? []) as Recipient[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  const seen = new Set<string>();
  return all.filter((r) => {
    const k = r.email.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface BroadcastResult {
  broadcastId: string;
  recipients: number;
  sent: number;
  failed: number;
  error: string | null;
}

// One send per item + audience at a time on this instance (a double click must not email everyone twice).
const inFlight = new Set<string>();

export async function sendBroadcast(
  adminId: string,
  input: { type: BroadcastSource; id: string; audience: BroadcastAudience; subject: string },
): Promise<BroadcastResult> {
  const missing = missingEmailEnv();
  if (missing.length) throw new HttpError(503, `ระบบอีเมลยังไม่ได้ตั้งค่า (${missing.join(", ")})`);
  const subject = input.subject.trim();
  if (subject.length < 1 || subject.length > SUBJECT_MAX) throw new HttpError(400, `หัวข้ออีเมลต้องยาว 1–${SUBJECT_MAX} ตัวอักษร`);

  const lockKey = `${input.type}:${input.id}:${input.audience}`;
  if (inFlight.has(lockKey)) throw new HttpError(409, "กำลังส่งอีเมลรายการนี้อยู่ รอให้เสร็จก่อน");
  inFlight.add(lockKey);
  try {
    const { item } = await loadSource(input.type, input.id);
    const recipients = await listRecipients(input.audience);
    if (!recipients.length) throw new HttpError(400, "ไม่มีผู้รับในกลุ่มนี้");

    const db = adminDb();
    const { data: row, error } = await db
      .from("email_broadcasts")
      .insert({ source_type: input.type, source_id: input.id, audience: input.audience, subject, recipients: recipients.length, created_by: adminId })
      .select("id")
      .single();
    if (error || !row) return dbError(error ?? { message: "no row" }, "insert email_broadcasts");

    const messages: OutgoingEmail[] = recipients.map((r) => {
      return {
        to: r.email,
        subject,
        unsubscribe: unsubscribePostUrl(r.user_id),
        ...renderBroadcastEmail(item, { name: r.display_name, unsubscribeUrl: unsubscribeUrl(r.user_id) }),
      };
    });
    const result = await sendEmails(messages, { idempotencyPrefix: row.id, deadlineMs: Date.now() + SEND_BUDGET_MS });

    const { error: updateError } = await db.from("email_broadcasts").update({ sent: result.sent, failed: result.failed, error: result.error }).eq("id", row.id);
    if (updateError) console.error("[broadcast] could not save result:", updateError.message);
    await db.from("admin_audit_log").insert({
      admin_id: adminId,
      action: "email.broadcast",
      target_type: input.type,
      target_id: input.id,
      note: `${input.audience}: ส่ง ${result.sent} ไม่สำเร็จ ${result.failed}`,
    });
    return { broadcastId: row.id, recipients: recipients.length, sent: result.sent, failed: result.failed, error: result.error };
  } finally {
    inFlight.delete(lockKey);
  }
}
