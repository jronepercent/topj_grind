/** Shared (client + server safe) types and helpers for ชุมชน / บทความ. */

export type PostKind = "community" | "article";
export type PostVisibility = "public" | "members";
export type PostStatus = "draft" | "published";

export const POST_LIMITS = {
  caption: 3000,
  images: 10,
  comment: 1000,
  title: 200,
  excerpt: 400,
  article: 60000,
} as const;

export interface PostAuthor {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  is_member: boolean;
}

/** A community post as the feed renders it. */
export interface PostView {
  id: string;
  kind: "community";
  author: PostAuthor;
  body: string;
  images: string[];
  is_pinned: boolean;
  is_hidden: boolean;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  published_at: string;
  created_at: string;
}

/** Article card / header data. `body` is only present when the viewer may read it. */
export interface ArticleView {
  id: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  visibility: PostVisibility;
  status: PostStatus;
  is_pinned: boolean;
  is_hidden: boolean;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  updated_at: string;
  author: PostAuthor;
  read_min: number;
  /** null when the viewer is locked out (members-only article, non-member). */
  body: string | null;
}

export interface PostCommentView {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  edited_at: string | null;
  created_at: string;
  author: PostAuthor;
  replies: PostCommentView[];
}

export interface FeedPage {
  items: PostView[];
  /** published_at of the last non-pinned item, pass back to load the next page. */
  cursor: string | null;
  hasMore: boolean;
}

/** Markdown/plain text → rough Thai word count (Thai has no spaces, so count by characters too). */
export function readMinutes(text: string): number {
  const plain = text.replace(/[`*_#>\-\[\]()!|~]/g, " ");
  const latin = (plain.match(/[A-Za-z0-9]+/g) ?? []).length;
  const thai = (plain.match(/[฀-๿]/g) ?? []).length;
  // ≈ 200 words/min for Latin, ≈ 5 Thai characters per word
  const words = latin + thai / 5;
  return Math.max(1, Math.round(words / 200));
}

/** Plain-text summary of Markdown for cards and meta descriptions. */
export function mdExcerpt(md: string, max = 160): string {
  const t = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** Streamed AI replies end with this marker followed by a message when something went wrong mid-stream. */
export const AI_ERROR_MARKER = "[[AI_ERROR]]";
