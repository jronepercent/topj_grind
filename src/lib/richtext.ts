import { parseTimestamp } from "./format";
import type { Chapter } from "./types";

export type RichToken =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "time"; value: string; sec: number };

const TOKEN_RE =
  /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|(#[\p{L}\p{M}\p{N}_]+)|(?<![\d:])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])/gu;

/** Split raw text into safe tokens. Rendering never uses innerHTML. */
export function tokenize(text: string): RichToken[] {
  const out: RichToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: "text", value: text.slice(last, i) });
    if (m[1]) out.push({ kind: "url", value: m[1] });
    else if (m[2]) out.push({ kind: "tag", value: m[2] });
    else if (m[3]) out.push({ kind: "time", value: m[3], sec: parseTimestamp(m[3]) });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

const CHAPTER_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—|]?\s*(.+?)\s*$/;

/** YouTube rules: starts at 0:00, at least 3 entries, ascending. */
export function parseChapters(description: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(CHAPTER_LINE);
    if (!m) continue;
    const sec = parseTimestamp(m[1]);
    if (chapters.length && sec <= chapters[chapters.length - 1].start_sec) continue;
    chapters.push({ start_sec: sec, title: m[2] });
  }
  if (chapters.length < 3 || chapters[0].start_sec !== 0) return [];
  return chapters;
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function isValidUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function excerpt(text: string, n = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
