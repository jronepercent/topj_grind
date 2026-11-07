/**
 * ของฟรี (/free) — shared types and helpers. Safe to import from server and client code.
 * Server-only data access lives in src/lib/server/freebies.ts; the table is in 0023_freebies.sql.
 *
 * Every freebie needs a sign-in to take: the point of giving it away is the lead (freebie_claims).
 */

export type FreebieKind = "file" | "tool";

export const FREEBIE_KIND_LABEL: Record<FreebieKind, string> = {
  file: "ไฟล์ดาวน์โหลด",
  tool: "เครื่องมือ",
};

export const FREEBIE_LIMITS = {
  title: 200,
  subtitle: 300,
  description: 20_000,
  url: 1000,
  /** Mirrors the `products` bucket's file_size_limit (2 GB) — freebies live in the same private bucket under free/<id>/. */
  fileBytes: 2 * 1024 * 1024 * 1024,
} as const;

/** Card / page data. The storage path never leaves the server; the tool URL does (it is where the button goes anyway). */
export interface FreebiePublic {
  id: string;
  kind: FreebieKind;
  title: string;
  subtitle: string | null;
  description: string;
  cover_url: string | null;
  file_name: string | null;
  file_size: number | null;
  /** kind 'tool' only. */
  url: string | null;
  is_featured: boolean;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
}

export interface FreebieAdminRow extends FreebiePublic {
  /** How many times it was taken (freebie_claims rows, admins excluded). */
  claims: number;
  /** Distinct people who took it. */
  people: number;
}

export interface FreebieAdminFull extends FreebieAdminRow {
  file_path: string | null;
}

export interface FreebieClaimRow {
  user_id: string;
  name: string;
  email: string;
  /** Most recent time this person took it. */
  last_at: string;
  times: number;
}

export const freebieHref = (id: string) => `/free/${id}`;
/** Take it: download for a file, open for a tool. Sign-in required (guests are sent to log in and back to the page). */
export const freebieClaimHref = (id: string) => `/api/free/${id}`;

/** https://… or a same-site path (/tools/x). Not //host, not /\ tricks. The same rule is a CHECK in 0023. */
export function isFreebieUrl(v: string): boolean {
  if (v.length > FREEBIE_LIMITS.url) return false;
  if (/^https:\/\/\S+$/i.test(v)) {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }
  return /^\/[^/\\]/.test(v) && !/\s/.test(v);
}

export const isExternalUrl = (v: string | null | undefined) => !!v && /^https:\/\//i.test(v);
