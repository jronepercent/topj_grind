import type {
  ContentType,
  MediaStatus,
  PaymentMethod,
  PublishStatus,
  Visibility,
} from "@/lib/types";

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
  visibility: Visibility;
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
  visibility: Visibility;
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
  visibility: Visibility;
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
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: "สมาชิก",
  expiring: "ใกล้หมด",
  expired: "หมดอายุ",
  never: "ไม่เคยจ่าย",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "บัตรเครดิต/เดบิต",
  promptpay: "PromptPay",
  slip: "แนบสลิป",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
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
