import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  AuditLog,
  Category,
  CommentReport,
  CommentRow,
  ContentLink,
  ContentResource,
  ContentRow,
  HomeSection,
  Notification,
  Payment,
  PaymentError,
  Playlist,
  PlaylistItem,
  Profile,
  SiteSettings,
  Subscription,
  UserContent,
  View,
  WatchProgress,
} from "@/lib/types";
import { buildSeed } from "./seed";

/**
 * Demo-mode data store.
 *
 * Mirrors the Supabase schema in supabase/migrations 1:1 so the query layer
 * (lib/server/db/*) can be swapped for Supabase calls without touching pages.
 * Data is persisted to .data/db.json so it survives dev-server restarts.
 */
export interface DB {
  profiles: Profile[];
  credentials: { user_id: string; password_hash: string }[];
  sessions: { token: string; user_id: string; created_at: string }[];
  magic_links: { token: string; email: string; expires_at: string; purpose: "login" | "reset" }[];
  subscriptions: Subscription[];
  payments: Payment[];
  payment_errors: PaymentError[];
  content: ContentRow[];
  content_links: ContentLink[];
  content_resources: ContentResource[];
  categories: Category[];
  playlists: Playlist[];
  playlist_items: PlaylistItem[];
  watch_progress: WatchProgress[];
  likes: UserContent[];
  saved: UserContent[];
  views: View[];
  comments: CommentRow[];
  comment_likes: { user_id: string; comment_id: string }[];
  comment_reports: CommentReport[];
  banned_words: { id: string; word: string }[];
  notifications: Notification[];
  home_sections: HomeSection[];
  site_settings: SiteSettings;
  admin_audit_log: AuditLog[];
  rate_limits: Record<string, number[]>;
}

const FILE = path.join(process.cwd(), ".data", "db.json");
const g = globalThis as unknown as { __tgdb?: DB; __tgdbTimer?: NodeJS.Timeout };

function load(): DB {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
  } catch {
    // corrupted file — reseed
  }
  const seeded = buildSeed();
  write(seeded);
  return seeded;
}

function write(db: DB) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch {
    // read-only filesystem (e.g. Vercel) — keep in memory only
  }
}

export function db(): DB {
  if (!g.__tgdb) g.__tgdb = load();
  return g.__tgdb;
}

/** Call after any mutation. Writes are debounced. */
export function commit() {
  if (g.__tgdbTimer) clearTimeout(g.__tgdbTimer);
  g.__tgdbTimer = setTimeout(() => g.__tgdb && write(g.__tgdb), 250);
}

export function resetDemoData() {
  g.__tgdb = buildSeed();
  write(g.__tgdb);
}

export function uid(prefix = "") {
  return prefix + crypto.randomUUID();
}

export const nowIso = () => new Date().toISOString();
