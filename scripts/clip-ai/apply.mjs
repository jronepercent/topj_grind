// Usage: node --env-file=.env.local scripts/clip-ai/apply.mjs <id…|--all> [--dry-run]
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { ROOT, WORK, clipDir, db } from "./lib.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
let ids = args.filter((a) => !a.startsWith("--"));
if (args.includes("--all")) ids = (await readdir(WORK, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
if (!ids.length) {
  console.error("Give clip id(s) or --all.");
  process.exit(1);
}

// Same pattern as parseChapters in src/lib/richtext.ts
const CHAPTER_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—|]?\s*(.+?)\s*$/;
const secOf = (t) => t.split(":").map(Number).reduce((a, n) => a * 60 + n, 0);
const read = (p) => readFile(p, "utf8").catch(() => null);

function chapterCheck(desc) {
  const starts = [];
  for (const line of desc.split(/\r?\n/)) {
    const m = line.match(CHAPTER_LINE);
    if (m) starts.push(secOf(m[1]));
  }
  if (!starts.length) return { count: 0, errors: [] };
  const errors = [];
  if (starts.length < 3) errors.push(`chapters: need at least 3 lines (found ${starts.length})`);
  if (starts[0] !== 0) errors.push("chapters: first line must be 0:00");
  for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) errors.push(`chapters: not strictly increasing at chapter ${i + 1}`);
  return { count: starts.length, errors };
}

// Build and validate every patch first; write nothing if any is invalid.
const plans = [];
let bad = false;
for (const id of ids) {
  const dir = clipDir(id);
  const vtt = await read(path.join(dir, "captions.vtt"));
  const metaRaw = await read(path.join(dir, "meta.json"));
  const patch = {}, info = [], errors = [];
  if (vtt !== null) {
    if (!vtt.startsWith("WEBVTT")) errors.push("captions.vtt must start with WEBVTT");
    patch.captions_vtt = vtt;
    info.push(`captions: ${vtt.length} chars, ${(vtt.match(/-->/g) || []).length} cues`);
  }
  if (metaRaw !== null) {
    let meta;
    try {
      meta = JSON.parse(metaRaw);
    } catch (e) {
      errors.push(`meta.json invalid JSON: ${e.message}`);
    }
    if (meta) {
      if ("description" in meta) {
        if (typeof meta.description !== "string") errors.push("description must be a string");
        else {
          if (meta.description.length > 5000) errors.push(`description ${meta.description.length} > 5000 chars`);
          const ch = chapterCheck(meta.description);
          errors.push(...ch.errors);
          patch.description = meta.description;
          info.push(`description: ${meta.description.length} chars, ${ch.count} chapter lines`);
        }
      }
      if ("tags" in meta) {
        if (!Array.isArray(meta.tags) || meta.tags.some((t) => typeof t !== "string")) errors.push("tags must be string[]");
        else {
          if (meta.tags.length > 10) errors.push(`tags: ${meta.tags.length} > 10`);
          for (const t of meta.tags) {
            if (t.startsWith("#")) errors.push(`tag "${t}" must not start with #`);
            if (!t.trim()) errors.push("empty tag");
            if (t.length > 40) errors.push(`tag "${t}" > 40 chars`);
          }
          patch.tags = meta.tags;
          info.push(`tags (${meta.tags.length}): ${meta.tags.join(", ")}`);
        }
      }
    }
  }
  if (!Object.keys(patch).length && !errors.length) {
    console.log(`skip  ${id}: nothing to apply (no captions.vtt / meta.json)`);
    continue;
  }
  if (errors.length) {
    bad = true;
    console.error(`INVALID ${id}:\n  - ${errors.join("\n  - ")}`);
  }
  plans.push({ id, patch, info });
}
if (bad) {
  console.error("Nothing written: fix the errors above.");
  process.exit(1);
}
if (!plans.length) process.exit(0);

const { data: rows, error } = await db().from("content").select("id, title, description, tags, captions_vtt").in("id", plans.map((p) => p.id));
if (error) throw new Error(error.message);
const byId = new Map(rows.map((r) => [r.id, r]));
for (const p of plans)
  if (!byId.has(p.id)) {
    console.error(`NOT FOUND ${p.id}`);
    process.exit(1);
  }

if (dry) {
  for (const p of plans) {
    const cur = byId.get(p.id);
    console.log(`DRY RUN ${p.id} "${cur.title}"`);
    for (const l of p.info) console.log(`  ${l}`);
    console.log(`  current: description ${cur.description?.length ?? 0} chars, ${cur.tags?.length ?? 0} tags, captions ${cur.captions_vtt ? cur.captions_vtt.length + " chars" : "none"}`);
    console.log(`  fields to write: ${Object.keys(p.patch).join(", ")}`);
  }
  console.log("(dry run: nothing written, no backup made)");
  await new Promise((r) => setTimeout(r, 200));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await mkdir(path.join(ROOT, "backups"), { recursive: true });
const backup = path.join(ROOT, "backups", `clip-ai-${stamp}.json`);
await writeFile(
  backup,
  JSON.stringify(plans.map((p) => {
    const r = byId.get(p.id);
    return { id: r.id, description: r.description, tags: r.tags, captions_vtt: r.captions_vtt };
  }), null, 2),
);
console.log(`backup: ${path.relative(ROOT, backup)}`);
for (const p of plans) {
  const { error: e } = await db().from("content").update(p.patch).eq("id", p.id);
  if (e) {
    console.error(`FAIL ${p.id}: ${e.message}`);
    process.exitCode = 1;
  } else console.log(`ok    ${p.id}: wrote ${Object.keys(p.patch).join(", ")}`);
}
