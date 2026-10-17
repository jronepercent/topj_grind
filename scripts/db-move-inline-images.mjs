#!/usr/bin/env node
// Move images saved inline as data URLs (base64 in the row) to the "thumbnails" Storage bucket
// and replace them with the public URL. Run before migration 0007, which forbids data URLs.
//   npm run db:move-inline-images              move them
//   npm run db:move-inline-images -- --dry-run list what would move
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, "utf8").split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith(name + "="));
    if (line) return line.slice(name.length + 1).replace(/^["']|["']$/g, "");
  }
}

const dryRun = process.argv.includes("--dry-run");
const db = new pg.Client({ connectionString: env("SUPABASE_DB_URL"), ssl: { rejectUnauthorized: false } });
const storage = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } }).storage.from("thumbnails");
const EXT = { png: "png", jpeg: "jpg", webp: "webp" };

/** One upload per distinct data URL — notifications repeat the clip's thumbnail. */
const uploaded = new Map();
async function upload(dataUrl, folder) {
  if (uploaded.has(dataUrl)) return uploaded.get(dataUrl);
  const m = dataUrl.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
  if (!m) throw new Error(`unsupported data URL: ${dataUrl.slice(0, 40)}…`);
  const path = `${folder}/${randomUUID()}.${EXT[m[2]]}`;
  const { error } = await storage.upload(path, Buffer.from(m[3], "base64"), { contentType: m[1] });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  const url = storage.getPublicUrl(path).data.publicUrl;
  uploaded.set(dataUrl, url);
  return url;
}

// Source tables first, so copies (notifications) reuse the same file.
const COLUMNS = [
  { table: "content", column: "thumbnail_url", folder: (r) => `content/${r.id}` },
  { table: "playlists", column: "thumbnail_url", folder: () => "playlists" },
  { table: "profiles", column: "avatar_url", folder: (r) => `avatars/${r.id}` },
  { table: "notifications", column: "image_url", folder: () => "notifications" },
];

await db.connect();
let moved = 0;
for (const { table, column, folder } of COLUMNS) {
  const { rows } = await db.query(`select id, ${column} as v from public.${table} where ${column} like 'data:%'`);
  for (const r of rows) {
    console.log(`${dryRun ? "would move" : "move"} ${table}.${column} ${r.id} (${Math.round(r.v.length / 1024)} KB)`);
    if (dryRun) continue;
    const url = await upload(r.v, folder(r));
    await db.query(`update public.${table} set ${column} = $1 where id = $2`, [url, r.id]);
    moved++;
  }
}

const { rows: settings } = await db.query("select key, value from public.site_settings");
for (const s of settings) {
  for (const k of ["avatar_url", "banner_url"]) {
    const v = s.value?.[k];
    if (typeof v !== "string" || !v.startsWith("data:")) continue;
    console.log(`${dryRun ? "would move" : "move"} site_settings.${s.key}.${k}`);
    if (dryRun) continue;
    const url = await upload(v, "channel");
    await db.query("update public.site_settings set value = jsonb_set(value, $1, to_jsonb($2::text)) where key = $3", [`{${k}}`, url, s.key]);
    moved++;
  }
}

await db.end();
console.log(dryRun ? "dry run — nothing changed" : `done: ${moved} field(s) moved to Storage`);
