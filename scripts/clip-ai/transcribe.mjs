// Usage: node --env-file=.env.local scripts/clip-ai/transcribe.mjs <id…|--missing|--all> [--force]
import { writeFile, mkdir, rm, access } from "node:fs/promises";
import path from "node:path";
import { clipDir, extractAudio, scribe, credits, resolveTargets, pool, mmss } from "./lib.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const exists = (p) => access(p).then(() => true, () => false);
let stop = false;

function renderTranscript(row, j) {
  const words = (j.words || []).filter((w) => w.type !== "audio_event");
  const lines = [];
  let cur = "", start = null, lastEnd = 0;
  const flush = () => {
    if (cur.trim()) lines.push(`[${mmss(start ?? 0)}] ${cur.trim()}`);
    cur = "";
    start = null;
  };
  for (const w of words) {
    if (w.type === "spacing") {
      if (cur) cur += w.text;
      continue;
    }
    const gap = start !== null ? w.start - lastEnd : 0;
    if (start !== null && (w.end - start >= 15 || (gap > 0.8 && lastEnd - start >= 6))) flush();
    if (start === null) start = w.start;
    cur += w.text;
    lastEnd = w.end;
    if (/[.!?…。！？]$/.test(w.text.trim()) && lastEnd - start >= 3) flush();
  }
  flush();
  if (!lines.length && j.text) lines.push(`[0:00] ${j.text.trim()}`);
  return `# ${row.title}\n${row.id} | ${row.type} | ${mmss(row.duration_sec)}\n\n${lines.join("\n")}\n`;
}

const rows = await resolveTargets(args, { allowMissing: true });
const todo = [];
for (const r of rows) {
  if (!force && (await exists(path.join(clipDir(r.id), "scribe.json")))) console.log(`skip  ${r.id} (scribe.json exists; --force to redo) ${r.title}`);
  else todo.push(r);
}
if (!todo.length) {
  console.log("Nothing to transcribe.");
  process.exit(0);
}

const before = await credits();
const failed = [];
await pool(todo, 3, async (row) => {
  if (stop) return;
  const dir = clipDir(row.id);
  const mp3 = path.join(dir, "audio.mp3");
  try {
    await mkdir(dir, { recursive: true });
    await extractAudio(row, mp3);
    const j = await scribe(mp3);
    await writeFile(path.join(dir, "scribe.json"), JSON.stringify(j));
    await writeFile(path.join(dir, "transcript.txt"), renderTranscript(row, j));
    console.log(`ok    ${row.id} ${mmss(row.duration_sec)} ${row.title}`);
  } catch (e) {
    if (e.fatal) stop = true;
    failed.push(row.id);
    console.error(`FAIL  ${row.id} ${row.title}: ${e.message}`);
  } finally {
    await rm(mp3, { force: true });
  }
});
const after = await credits();
if (before && after) console.log(`ElevenLabs characters: ${before.used} -> ${after.used} (used ${after.used - before.used}; limit ${after.limit})`);
if (failed.length) {
  console.error(`${failed.length} failed: ${failed.join(" ")}`);
  process.exit(1);
}
