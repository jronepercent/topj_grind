// Shared helpers for the clip-ai pipeline. Run scripts with: node --env-file=.env.local scripts/clip-ai/<script>.mjs
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const WORK = path.join(ROOT, ".clip-ai");
export const clipDir = (id) => path.join(WORK, id);
export const REFERER = "https://topjgrind.com/";

export function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env ${name}. Run with: node --env-file=.env.local scripts/clip-ai/<script>.mjs`);
    process.exit(1);
  }
  return v;
}

let _db;
export function db() {
  if (!_db) {
    _db = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _db;
}

/** Same scheme as signBunnyUrl in src/lib/server/media.ts. */
function signBunny(host, key, filePath, tokenPath, ttl = 7200) {
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const token = createHash("sha256")
    .update(key + tokenPath + expires + `token_path=${tokenPath}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `https://${host}/bcdn_token=${token}&expires=${expires}&token_path=${encodeURIComponent(tokenPath)}${filePath}`;
}

/** Returns { url, bunny } or null when the row has no playable media. */
export async function mediaUrl(row) {
  if (row.type !== "podcast" && row.bunny_video_id) {
    const dir = `/${row.bunny_video_id}/`;
    const url = signBunny(need("BUNNY_STREAM_CDN_HOST"), need("BUNNY_STREAM_TOKEN_KEY"), `${dir}playlist.m3u8`, dir);
    return { url, bunny: true };
  }
  if (row.type === "podcast" && row.audio_path) {
    const { data, error } = await db().storage.from("podcasts").createSignedUrl(row.audio_path, 6 * 3600);
    if (error || !data?.signedUrl) throw new Error(`podcast sign failed: ${error?.message ?? "no url"}`);
    return { url: data.signedUrl, bunny: false };
  }
  if (row.demo_src) return { url: row.demo_src, bunny: false };
  return null;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code ? reject(new Error(`${cmd} exit ${code}: ${err.trim().slice(-300)}`)) : resolve()));
  });
}

/** ffmpeg -> mono 16 kHz MP3 48k. */
export async function extractAudio(row, outPath) {
  const m = await mediaUrl(row);
  if (!m) throw new Error("no media for this clip");
  await mkdir(path.dirname(outPath), { recursive: true });
  const args = ["-y", "-v", "error"];
  if (m.bunny) args.push("-headers", `Referer: ${REFERER}\r\n`);
  args.push("-i", m.url, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", outPath);
  await run("ffmpeg", args);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function apiMessage(text) {
  try {
    const j = JSON.parse(text);
    const d = j.detail;
    return typeof d === "string" ? d : d?.message || JSON.stringify(d ?? j);
  } catch {
    return text.slice(0, 300);
  }
}

export async function scribe(mp3Path) {
  const key = need("ELEVENLABS_API_KEY");
  const buf = await readFile(mp3Path);
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const form = new FormData();
    form.set("model_id", "scribe_v1");
    form.set("language_code", "tha");
    form.set("timestamps_granularity", "word");
    form.set("tag_audio_events", "false");
    form.set("diarize", "false");
    form.set("file", new Blob([buf], { type: "audio/mpeg" }), path.basename(mp3Path));
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
    if (res.ok) return await res.json();
    const text = await res.text();
    if (res.status === 401 || res.status === 402) {
      const e = new Error(`ElevenLabs ${res.status}: ${apiMessage(text)}`);
      e.fatal = true;
      throw e;
    }
    last = `ElevenLabs ${res.status}: ${apiMessage(text)}`;
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) await sleep(10000 * 2 ** attempt);
      continue;
    }
    throw new Error(last);
  }
  throw new Error(last);
}

/** { used, limit } characters, or null if unavailable. */
export async function credits() {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": need("ELEVENLABS_API_KEY") } });
    if (!res.ok) return null;
    const j = await res.json();
    return { used: j.character_count, limit: j.character_limit };
  } catch {
    return null;
  }
}

export const mmss = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/**
 * Resolve CLI args to content rows. Accepts ids, --all, --missing (captions_vtt null).
 * Only live (published/scheduled), not deleted, video|podcast rows.
 */
export async function resolveTargets(args, { allowMissing = false } = {}) {
  const ids = args.filter((a) => !a.startsWith("--"));
  const all = args.includes("--all");
  const missing = allowMissing && args.includes("--missing");
  if (!ids.length && !all && !missing) {
    console.error("Give clip id(s)" + (allowMissing ? ", --missing" : "") + " or --all.");
    process.exit(1);
  }
  let q = db().from("content").select("*").is("deleted_at", null).in("type", ["video", "podcast"]).in("status", ["published", "scheduled"]);
  if (ids.length) q = q.in("id", ids);
  else if (missing) q = q.is("captions_vtt", null);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  for (const id of ids) if (!data.some((r) => r.id === id)) console.error(`warn: ${id} not found (or not published/scheduled video|podcast)`);
  return data;
}

/** Map over items with limited concurrency. */
export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}
