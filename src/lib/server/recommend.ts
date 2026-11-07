import "server-only";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/supabase/clients";
import { catalog, getContentsByIds, progressMap, related } from "./queries";
import { onboardingState, pathFor, type OnboardingState } from "./onboarding";
import type { Content } from "@/lib/types";

/** Simple rule-based recommendations: a "popular" row built from recent views, and the order of the watch page's up-next list. */

// ───────────────────────── Trending ─────────────────────────
const DAY_MS = 86_400_000;
const PAGE = 1000;
const MAX_ROWS = 50_000;
const MIN_ITEMS = 4;

interface Trend {
  week: string[];
  month: string[];
}

interface ViewRow {
  content_id: string;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
}

function rank(rows: ViewRow[]): string[] {
  const viewers = new Map<string, Set<string>>();
  const total = new Map<string, number>();
  for (const r of rows) {
    const key = r.user_id ?? "s:" + r.session_id;
    let set = viewers.get(r.content_id);
    if (!set) viewers.set(r.content_id, (set = new Set()));
    set.add(key);
    total.set(r.content_id, (total.get(r.content_id) ?? 0) + 1);
  }
  return [...viewers.keys()].sort(
    (a, b) => viewers.get(b)!.size - viewers.get(a)!.size || (total.get(b) ?? 0) - (total.get(a) ?? 0),
  );
}

const loadTrending = unstable_cache(
  async (): Promise<Trend> => {
    const empty: Trend = { week: [], month: [] };
    try {
      const db = adminDb();
      const now = Date.now();
      const since = new Date(now - 30 * DAY_MS).toISOString();
      const weekAgo = now - 7 * DAY_MS;
      const rows: ViewRow[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data, error } = await db
          .from("views")
          .select("content_id, user_id, session_id, created_at")
          .gte("created_at", since)
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as ViewRow[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      // The owner's own test plays would dominate a small channel: drop views from admin accounts.
      const { data: admins, error: adminErr } = await db.from("profiles").select("id").eq("role", "admin");
      if (adminErr) throw new Error(adminErr.message);
      const adminIds = new Set((admins ?? []).map((a) => a.id as string));
      const counted = rows.filter((r) => !r.user_id || !adminIds.has(r.user_id));
      return { week: rank(counted.filter((r) => new Date(r.created_at).getTime() >= weekAgo)), month: rank(counted) };
    } catch (e) {
      console.error("[trending]", e);
      return empty;
    }
  },
  ["tg-trending-v1"],
  { revalidate: 600 },
);

/** Most-watched clips (distinct viewers) of the last 7 days, falling back to 30 days when the week is too quiet. */
export async function trending(limit = 12): Promise<{ window: "week" | "month"; items: Content[] }> {
  const t = await loadTrending();
  const pick = async (ids: string[]) => (await getContentsByIds(ids)).filter((c) => c.type === "video" || c.type === "podcast");
  const week = await pick(t.week);
  if (week.length >= MIN_ITEMS) return { window: "week", items: week.slice(0, limit) };
  const month = await pick(t.month);
  if (month.length >= MIN_ITEMS) return { window: "month", items: month.slice(0, limit) };
  return { window: "month", items: [] };
}

// ───────────────────────── Up next (watch page) ─────────────────────────
/** Order for the watch page's "up next" list; the first item autoplays. */
export async function upNext(c: Content, viewerId: string | null, limit = 14): Promise<Content[]> {
  const [scored, progress, ob] = await Promise.all([
    related(c, 40),
    progressMap(viewerId),
    viewerId ? onboardingState(viewerId).catch((): OnboardingState | null => null) : Promise.resolve(null),
  ]);

  const out: Content[] = [];
  const seen = new Set<string>([c.id]);
  const add = (x: Content | undefined) => {
    if (x && !seen.has(x.id)) {
      seen.add(x.id);
      out.push(x);
    }
  };

  // a. Next in series: the first playlist containing c that has a live item after it.
  const cat = await catalog();
  const byList = new Map<string, string[]>();
  for (const it of cat.items) {
    const l = byList.get(it.playlist_id);
    if (l) l.push(it.content_id);
    else byList.set(it.playlist_id, [it.content_id]);
  }
  const afterByList: string[][] = [];
  for (const p of cat.playlists) {
    const ids = byList.get(p.id) ?? [];
    const i = ids.indexOf(c.id);
    if (i >= 0 && i < ids.length - 1) afterByList.push(ids.slice(i + 1));
  }
  if (afterByList.length) {
    const live = new Map((await getContentsByIds([...new Set(afterByList.flat())])).map((x) => [x.id, x]));
    for (const ids of afterByList) {
      const next = ids.map((id) => live.get(id)).find((x) => x && x.id !== c.id);
      if (next) {
        add(next);
        break;
      }
    }
  }

  // b. Next in the viewer's starter path.
  if (ob?.stage) {
    const path = await pathFor(ob.stage).catch((): Content[] => []);
    const i = path.findIndex((x) => x.id === c.id);
    if (i >= 0) add(path.slice(i + 1).find((x) => !progress[x.id]?.completed));
  }

  // c. Scored related list: unfinished clips first, finished ones after.
  for (const x of scored) if (!progress[x.id]?.completed) add(x);
  for (const x of scored) add(x);

  return out.slice(0, limit);
}
