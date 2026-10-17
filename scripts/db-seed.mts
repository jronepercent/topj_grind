#!/usr/bin/env node
// Load the sample channel into Supabase (12 videos, 8 Grind, 5 podcasts, 2 playlists, demo accounts).
//   npm run db:seed              load (refuses if already seeded)
//   npm run db:seed -- --force   remove the previous seed, then load again
//   npm run db:seed -- --remove  remove everything the seed created (do this before going public)
// Demo account password: DEMO_PASSWORD in .env.local (generated on first run, never committed).
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { buildSeed } from "./seed-data.mts";

const ENV_FILE = ".env.local";
function readEnv() {
  const env: Record<string, string> = {};
  for (const l of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}
let env = readEnv();
if (!env.DEMO_PASSWORD) {
  const pw = randomBytes(12).toString("base64url");
  fs.appendFileSync(ENV_FILE, `\n# Password for the demo accounts created by npm run db:seed\nDEMO_PASSWORD=${pw}\n`);
  env = readEnv();
  console.log("Generated DEMO_PASSWORD in .env.local");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const args = process.argv.slice(2);
const track = (tbl: string, ids: string[]) =>
  ids.length ? db.query("insert into app_private.seed_rows (tbl, id) select $1, unnest($2::text[]) on conflict do nothing", [tbl, ids]) : null;

function ok<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function remove() {
  const rows = (await db.query("select tbl, id from app_private.seed_rows")).rows as { tbl: string; id: string }[];
  const by = (t: string) => rows.filter((r) => r.tbl === t).map((r) => r.id);
  for (const t of ["home_sections", "playlists", "content", "categories"]) {
    const ids = by(t);
    if (ids.length) ok(await sb.from(t).delete().in("id", ids), `remove ${t}`);
  }
  for (const id of by("auth.users")) await sb.auth.admin.deleteUser(id); // cascades profile, subscription, payments, …
  await db.query("delete from app_private.seed_rows");
  console.log(`Removed seed: ${by("content").length} clips, ${by("auth.users").length} demo users.`);
}

async function load() {
  const s = buildSeed();
  const uid = new Map<string, string>(); // placeholder id → uuid

  // 1) Users (real Supabase Auth accounts; trigger creates profile + subscription)
  for (const p of s.profiles) {
    const res = await sb.auth.admin.createUser({
      email: p.email,
      password: env.DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: p.display_name, seed: true },
    });
    if (res.error) throw new Error(`create user ${p.email}: ${res.error.message}`);
    uid.set(p.id, res.data.user.id);
    await track("auth.users", [res.data.user.id]);
    ok(await sb.from("profiles").update({ role: p.role, avatar_url: p.avatar_url, display_name: p.display_name }).eq("id", res.data.user.id), "profile");
  }
  for (const sub of s.subscriptions) {
    ok(
      await sb.from("subscriptions").update({ expires_at: sub.expires_at, first_paid_at: sub.first_paid_at }).eq("user_id", uid.get(sub.user_id)!),
      "subscription",
    );
  }
  ok(
    await sb.from("payments").insert(
      s.payments.map(({ id: _id, user_id, ...p }) => ({ ...p, user_id: uid.get(user_id)!, reference: `${p.reference}-${Date.now()}` })),
    ),
    "payments",
  );

  // 2) Categories
  const cats = ok(await sb.from("categories").insert(s.categories.map(({ id: _id, ...c }) => c)).select("id, slug"), "categories")!;
  for (const c of s.categories) uid.set(c.id, cats.find((x) => x.slug === c.slug)!.id);
  await track("categories", cats.map((c) => c.id));

  // 3) Content (counters set at the end; triggers bump them while we add views/likes/comments)
  for (const c of s.content) {
    const { id, linked_content_id: _l, category_id, view_count: _v, like_count: _k, comment_count: _cc, ...rest } = c;
    const row = ok(await sb.from("content").insert({ ...rest, category_id: category_id ? uid.get(category_id) : null }).select("id").single(), `content ${id}`)!;
    uid.set(id, row.id);
  }
  await track("content", s.content.map((c) => uid.get(c.id)!));
  for (const c of s.content.filter((x) => x.linked_content_id)) {
    ok(await sb.from("content").update({ linked_content_id: uid.get(c.linked_content_id!)! }).eq("id", uid.get(c.id)!), "link short");
  }

  // 4) Links, resources, playlists
  ok(await sb.from("content_links").insert(s.content_links.map(({ id: _id, content_id, ...l }) => ({ ...l, content_id: uid.get(content_id)! }))), "links");
  ok(
    await sb.from("content_resources").insert(s.content_resources.map(({ id: _id, content_id, ...r }) => ({ ...r, content_id: uid.get(content_id)! }))),
    "resources",
  );
  for (const p of s.playlists) {
    const { id, ...rest } = p;
    const row = ok(await sb.from("playlists").insert(rest).select("id").single(), `playlist ${id}`)!;
    uid.set(id, row.id);
  }
  await track("playlists", s.playlists.map((p) => uid.get(p.id)!));
  ok(
    await sb.from("playlist_items").insert(s.playlist_items.map((i) => ({ playlist_id: uid.get(i.playlist_id)!, content_id: uid.get(i.content_id)!, position: i.position }))),
    "playlist items",
  );

  // 5) Activity
  const mapU = (x: { user_id: string; content_id: string }) => ({ user_id: uid.get(x.user_id)!, content_id: uid.get(x.content_id)! });
  ok(await sb.from("watch_progress").insert(s.watch_progress.map((w) => ({ ...w, ...mapU(w) }))), "progress");
  ok(await sb.from("likes").insert(s.likes.map((l) => ({ ...l, ...mapU(l) }))), "likes");
  ok(await sb.from("saved").insert(s.saved.map((l) => ({ ...l, ...mapU(l) }))), "saved");
  for (let i = 0; i < s.views.length; i += 500) {
    ok(
      await sb.from("views").insert(
        s.views.slice(i, i + 500).map(({ id: _id, content_id, user_id, ...v }) => ({ ...v, content_id: uid.get(content_id)!, user_id: user_id ? uid.get(user_id)! : null })),
      ),
      "views",
    );
  }
  for (const c of [...s.comments.filter((x) => !x.parent_id), ...s.comments.filter((x) => x.parent_id)]) {
    const { id, content_id, user_id, parent_id, ...rest } = c;
    const row = ok(
      await sb
        .from("comments")
        .insert({ ...rest, content_id: uid.get(content_id)!, user_id: uid.get(user_id)!, parent_id: parent_id ? uid.get(parent_id)! : null })
        .select("id")
        .single(),
      `comment ${id}`,
    )!;
    uid.set(id, row.id);
  }
  ok(
    await sb.from("comment_reports").insert(s.comment_reports.map(({ id: _id, comment_id, user_id, ...r }) => ({ ...r, comment_id: uid.get(comment_id)!, user_id: uid.get(user_id)! }))),
    "reports",
  );
  ok(await sb.from("notifications").insert(s.notifications.map(({ id: _id, user_id, link, ...n }) => ({ ...n, user_id: uid.get(user_id)!, link: remapLink(link) }))), "notifications");

  // 6) Home, settings, banned words
  const home = ok(
    await sb
      .from("home_sections")
      .insert(s.home_sections.map(({ id: _id, content_ids, ...h }) => ({ ...h, content_ids: content_ids.map((c) => uid.get(c)!) })))
      .select("id"),
    "home",
  )!;
  await track("home_sections", home.map((h) => h.id));
  ok(await sb.from("site_settings").upsert({ key: "site", value: s.site_settings }), "settings");
  ok(await sb.from("banned_words").upsert(s.banned_words.map(({ id: _id, ...w }) => w), { onConflict: "word" }), "banned words");

  // 7) Counters back to the sample numbers (triggers counted the sample rows above)
  for (const c of s.content) ok(await sb.from("content").update({ view_count: c.view_count, like_count: c.like_count }).eq("id", uid.get(c.id)!), "counters");

  function remapLink(link: string | null) {
    if (!link) return link;
    return link.replace(/\/(watch|shorts|podcasts)\/([a-z]\d\d)/, (_m, kind, id) => `/${kind}/${uid.get(id) ?? id}`);
  }

  console.log(`Seeded ${s.content.length} clips, ${s.playlists.length} playlists, ${s.profiles.length} demo users.`);
  console.log("Demo accounts:", Object.values(s.profiles.slice(0, 4).map((p) => p.email)).join(", "), "(password: DEMO_PASSWORD in .env.local)");
}

try {
  const seeded = Number((await db.query("select count(*) from app_private.seed_rows")).rows[0].count) > 0;
  if (args.includes("--remove")) await remove();
  else if (seeded && !args.includes("--force")) console.log("Already seeded. Use --force to reload or --remove to delete it.");
  else {
    if (seeded) await remove();
    await load();
  }
} finally {
  await db.end();
}
