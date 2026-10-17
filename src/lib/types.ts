export type ContentType = "video" | "short" | "podcast";
export type Visibility = "public" | "members";
export type PublishStatus = "draft" | "scheduled" | "published";
export type MediaStatus = "uploading" | "processing" | "ready" | "failed";
export type Role = "user" | "admin";
export type ThemePref = "dark" | "light" | "system";
export type PaymentMethod = "card" | "promptpay" | "slip" | "apple_pay" | "google_pay" | "manual";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
  is_banned: boolean;
  autoplay: boolean;
  theme: ThemePref;
  save_history: boolean;
  created_at: string;
}

export interface Subscription {
  user_id: string;
  expires_at: string | null;
  first_paid_at: string | null;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  months: number;
  method: PaymentMethod;
  reference: string;
  paid_at: string;
  raw: unknown;
  created_at: string;
}

export interface PaymentError {
  id: string;
  payload: unknown;
  reason: string;
  resolved: boolean;
  created_at: string;
}

/** Full content row — server only (contains media locations). */
export interface ContentRow {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  thumbnail_url: string | null;
  preview_url: string | null; // Bunny animated WebP preview — safe to expose
  bunny_video_id: string | null;
  audio_path: string | null;
  /** Demo-mode playable source. Never sent to the browser except through /api/play. */
  demo_src: string | null;
  duration_sec: number;
  width: number | null;
  height: number | null;
  visibility: Visibility;
  status: PublishStatus;
  media_status: MediaStatus;
  /** "เผยแพร่ทันที" chosen before media finished processing → publish when ready */
  publish_when_ready?: boolean;
  published_at: string | null;
  scheduled_at: string | null;
  category_id: string | null;
  tags: string[];
  comments_enabled: boolean;
  linked_content_id: string | null;
  linked_start_sec: number | null;
  captions_vtt: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What the browser is allowed to see. */
export type Content = Omit<ContentRow, "demo_src" | "audio_path" | "bunny_video_id" | "captions_vtt" | "publish_when_ready"> & {
  has_captions: boolean;
};

export interface ContentLink {
  id: string;
  content_id: string;
  label: string;
  url: string;
  position: number;
}

export interface Chapter {
  start_sec: number;
  title: string;
}

export interface ContentResource {
  id: string;
  content_id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  position: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  position: number;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  visibility: Visibility;
  is_course: boolean;
  position: number;
  created_at: string;
}

export interface PlaylistItem {
  playlist_id: string;
  content_id: string;
  position: number;
}

export interface WatchProgress {
  user_id: string;
  content_id: string;
  position_sec: number;
  completed: boolean;
  updated_at: string;
}

export interface UserContent {
  user_id: string;
  content_id: string;
  created_at: string;
}

export interface View {
  id: string;
  content_id: string;
  user_id: string | null;
  session_id: string;
  watched_sec: number;
  created_at: string;
}

export interface CommentRow {
  id: string;
  content_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  is_pinned: boolean;
  creator_hearted: boolean;
  is_hidden: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface CommentView extends CommentRow {
  author: { id: string; display_name: string; avatar_url: string | null; is_member: boolean; is_creator: boolean };
  liked_by_me: boolean;
  reply_count: number;
  replies?: CommentView[];
}

export interface CommentReport {
  id: string;
  comment_id: string;
  user_id: string;
  reason: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "new_content" | "reply" | "heart" | "pin" | "expiring" | "payment";
  title: string;
  body: string;
  link: string | null;
  image_url: string | null;
  read_at: string | null;
  created_at: string;
}

export type HomeSectionType = "hero" | "continue" | "latest" | "shorts" | "podcasts" | "playlists" | "custom";

export interface HomeSection {
  id: string;
  type: HomeSectionType;
  title: string;
  content_ids: string[];
  position: number;
  enabled: boolean;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  note: string;
  created_at: string;
}

export interface SiteSettings {
  channel_name: string;
  tagline: string;
  about: string;
  avatar_url: string;
  banner_url: string;
  socials: { key: string; label: string; url: string }[];
  paywall_title: string;
  paywall_benefits: string[];
  price_thb: number;
}

/** Viewer as seen by the client. */
export interface Viewer {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
  is_member: boolean;
  is_admin: boolean;
  expires_at: string | null;
  autoplay: boolean;
  theme: ThemePref;
  is_banned: boolean;
  save_history: boolean;
  /** #0042 on the member card — order of first payment */
  member_no: number | null;
}

export interface PlaylistWithMeta extends Playlist {
  item_count: number;
  total_sec: number;
  completed_count: number;
  first_thumb: string | null;
}
