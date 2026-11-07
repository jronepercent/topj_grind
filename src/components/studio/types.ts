import type {
  ContentType,
  MediaStatus,
  PaymentMethod,
  PublishStatus,
  Visibility,
  ContentVisibility,
} from "@/lib/types";
import { PAYMENT_METHOD_LABEL, PLANS, type PlanCode } from "@/lib/plans";

/** Plain, serializable shapes passed from Studio server pages to client components. */

export interface DailyPoint {
  key: string; // YYYY-MM-DD (Asia/Bangkok)
  label: string; // 17 ต.ค.
  count: number;
}

export interface StudioContentRow {
  id: string;
  type: ContentType;
  title: string;
  thumbnail_url: string | null;
  duration_sec: number;
  visibility: ContentVisibility;
  status: PublishStatus;
  media_status: MediaStatus;
  publish_when_ready: boolean;
  published_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
}

/** Lightweight item for content pickers (playlists, Home curation, linked clip). */
export interface PickItem {
  id: string;
  type: ContentType;
  title: string;
  thumbnail_url: string | null;
  duration_sec: number;
  visibility: ContentVisibility;
  live: boolean;
}

export interface EditorData {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  thumbnail_url: string | null;
  category_id: string | null;
  tags: string[];
  visibility: ContentVisibility;
  comments_enabled: boolean;
  linked_content_id: string | null;
  linked_start_sec: number | null;
  captions_vtt: string | null;
  links: { label: string; url: string }[];
  resources: { id?: string; file_name: string; size_bytes: number }[];
  playlist_ids: string[];
  status: PublishStatus;
  publish_when_ready: boolean;
  scheduled_at: string | null;
  published_at: string | null;
  media_status: MediaStatus;
  duration_sec: number;
  width: number | null;
  height: number | null;
  updated_at: string;
}

export interface EditorOptions {
  categories: { id: string; name: string }[];
  playlists: { id: string; title: string; visibility: Visibility }[];
  videos: { id: string; title: string; thumbnail_url: string | null; duration_sec: number }[];
  channelName: string;
  channelAvatar: string | null;
}

export type MemberStatus = "active" | "expiring" | "expired" | "never";

export interface MemberRow {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  is_banned: boolean;
  first_paid_at: string | null;
  expires_at: string | null;
  status: MemberStatus;
  last_method: PaymentMethod | null;
  last_watch: string | null;
  /** Auth account creation (falls back to profiles.created_at). */
  signed_up_at: string;
  last_sign_in_at: string | null;
  provider: AuthProvider;
  email_confirmed: boolean;
  onboarding_stage: OnboardingStage | null;
  email_updates: boolean;
  /** Plan of the newest payment that has one. */
  plan: PlanCode | null;
  /** Sum of payments + paid shop purchases, in THB. */
  lifetime_thb: number;
  clips_started: number;
  clips_completed: number;
  watch_sec: number;
  /** Latest of watch progress, views and sign-in. */
  last_active: string | null;
  /** Not paying (never / expired) but watched a lot in the last 7 days. */
  hot: boolean;
  /** Distinct Bangkok days with at least one view. */
  view_days: number;
  /** Distinct clips viewed in the last 7 days. */
  recent_clips_7d: number;
  /** Estimated seconds watched (from progress rows updated) in the last 7 days. */
  recent_sec_7d: number;
}

export type AuthProvider = "google" | "email";
export type OnboardingStage = "idea" | "build" | "sell";

export const ONBOARDING_STAGE_LABEL: Record<OnboardingStage, string> = {
  idea: "มีไอเดีย",
  build: "กำลังสร้าง",
  sell: "กำลังขาย",
};

export const PROVIDER_LABEL: Record<AuthProvider, string> = { google: "Google", email: "อีเมล" };

export const PLAN_LABEL: Record<PlanCode, string> = { monthly: PLANS.monthly.label, yearly: PLANS.yearly.label };

export type MemberSegment = "all" | "paid" | "free" | "expiring" | "expired" | "quiet" | "hot";

export const MEMBER_SEGMENTS: MemberSegment[] = ["all", "paid", "free", "expiring", "expired", "quiet", "hot"];

export const SEGMENT_LABEL: Record<MemberSegment, string> = {
  all: "ทั้งหมด",
  paid: "จ่ายเงิน",
  free: "บัญชีฟรี",
  expiring: "ใกล้หมด",
  expired: "หมดอายุ",
  quiet: "เงียบหาย",
  hot: "Lead ร้อน 🔥",
};

const QUIET_MS = 14 * 86_400_000;

export function inSegment(r: MemberRow, seg: MemberSegment, now = Date.now()): boolean {
  switch (seg) {
    case "all":
      return true;
    case "paid":
      return r.status === "active" || r.status === "expiring";
    case "free":
      return r.status === "never";
    case "expiring":
      return r.status === "expiring";
    case "expired":
      return r.status === "expired";
    case "hot":
      return r.hot;
    case "quiet": {
      if (now - new Date(r.signed_up_at).getTime() <= QUIET_MS) return false;
      return !r.last_active || now - new Date(r.last_active).getTime() > QUIET_MS;
    }
  }
}

/** Maps legacy `?status=` values and `?seg=` to a segment. */
export function parseSegment(v: string | undefined | null): MemberSegment {
  const legacy: Record<string, MemberSegment> = { active: "paid", never: "free" };
  const x = v ? (legacy[v] ?? v) : "all";
  return (MEMBER_SEGMENTS as string[]).includes(x) ? (x as MemberSegment) : "all";
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: "สมาชิก",
  expiring: "ใกล้หมด",
  expired: "หมดอายุ",
  never: "ไม่เคยจ่าย",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  ...PAYMENT_METHOD_LABEL,
  slip: "แนบสลิป",
  manual: "แอดมินต่ออายุ",
};

export interface StudioComment {
  id: string;
  content_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  is_pinned: boolean;
  creator_hearted: boolean;
  is_hidden: boolean;
  like_count: number;
  author: { id: string; display_name: string; avatar_url: string | null; is_banned: boolean; is_member: boolean };
  content: { id: string; type: ContentType; title: string; thumbnail_url: string | null };
  parent_excerpt: string | null;
  answered: boolean;
  admin_reply: string | null;
  reports: { reason: string; created_at: string }[];
}

/** Everything the member profile page shows (plain, serializable). */
export interface MemberDetail {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  is_banned: boolean;
  signed_up_at: string;
  last_sign_in_at: string | null;
  provider: AuthProvider;
  email_confirmed: boolean;
  onboarding_stage: OnboardingStage | null;
  email_updates: boolean;
  status: MemberStatus;
  expires_at: string | null;
  first_paid_at: string | null;
  payments: { id: string; paid_at: string; plan: PlanCode | null; method: PaymentMethod; months: number; amount: number; reference: string | null }[];
  purchases: { id: string; title: string; amount: number; status: string; paid_at: string | null }[];
  samples: { id: string; title: string; created_at: string }[];
  watched: {
    content_id: string;
    type: ContentType;
    title: string;
    thumbnail_url: string | null;
    duration_sec: number;
    position_sec: number;
    completed: boolean;
    updated_at: string;
  }[];
  /** View count per Bangkok day, last 30 days. */
  daily: DailyPoint[];
  active_days_30: number;
  watch_sec: number;
  lifetime_thb: number;
  clips_started: number;
  clips_completed: number;
  likes: number;
  saved: number;
  comments: { id: string; body: string; created_at: string; content_id: string; content_type: ContentType; content_title: string }[];
  posts: { id: string; body: string; created_at: string }[];
  post_comment_count: number;
  welcome: { step: number; sent_at: string }[];
  notes: { id: string; body: string; created_at: string; author: string }[];
  notes_available: boolean;
  audit: { id: string; action: string; note: string; created_at: string; admin: string }[];
  /** Latest "ทักแล้ว"; null when none or the table is not migrated. */
  last_followup: { kind: FollowupKind; created_at: string } | null;
}

/** "3.4 ชม." / "25 นาที" for watch time. */
export function formatWatch(sec: number): string {
  if (sec <= 0) return "0 นาที";
  if (sec < 60) return "< 1 นาที";
  if (sec < 3600) return `${Math.round(sec / 60)} นาที`;
  return `${(sec / 3600).toFixed(1)} ชม.`;
}

// ───────── Follow-ups & funnel (phase 2) ─────────
export type FollowupKind = "hot" | "sample" | "expiring" | "at_risk" | "no_watch";

export const FOLLOWUP_KINDS: FollowupKind[] = ["hot", "sample", "expiring", "at_risk", "no_watch"];

/** Thai group names (also used to render the audit note of `member.followup`). */
export const FOLLOWUP_LABEL: Record<FollowupKind, string> = {
  hot: "Lead ร้อน 🔥",
  sample: "โหลดไฟล์ตัวอย่างแต่ยังไม่ซื้อ",
  expiring: "ใกล้หมดใน 7 วัน",
  at_risk: "จ่ายแล้วแต่หายไป",
  no_watch: "สมัครแล้วไม่เคยดู",
};

export const FOLLOWUP_HINT: Record<FollowupKind, string> = {
  hot: "ยังไม่จ่าย แต่ดูหนักใน 7 วัน → ทักไปปิดการขาย",
  sample: "→ ทักไปขายตัวเต็ม",
  expiring: "→ เตือนให้ต่ออายุ",
  at_risk: "จ่ายเงินอยู่แต่ไม่ได้เข้ามา 14 วัน → ดึงกลับ",
  no_watch: "→ ส่งคลิปเริ่มต้นให้",
};

export function isFollowupKind(v: unknown): v is FollowupKind {
  return typeof v === "string" && (FOLLOWUP_KINDS as string[]).includes(v);
}

/** Audit note as shown to people: the followup kind becomes its Thai group name. */
export function auditNoteText(action: string, note: string): string {
  return action === "member.followup" && isFollowupKind(note) ? FOLLOWUP_LABEL[note] : note;
}

export interface FollowupItem {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  reason: string;
  sort: number;
}

export interface FollowupGroup {
  kind: FollowupKind;
  title: string;
  hint: string;
  items: FollowupItem[];
}

export type FunnelWindowKey = "30" | "90" | "all";

export interface FunnelWindow {
  key: FunnelWindowKey;
  label: string;
  steps: { label: string; count: number }[];
  /** `answered` / `stages`: everyone in the cohort with a stage. `since`: only people who signed up after onboarding launched. */
  onboarding: { answered: number; stages: Record<OnboardingStage, number>; since: { total: number; answered: number } };
}
