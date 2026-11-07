// Usage: node scripts/clip-ai/vtt.mjs <id…|--all>   (no env needed; reads .clip-ai/<id>/scribe.json)
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { WORK, clipDir } from "./lib.mjs";

const MAX_LINE = 42, MIN_DUR = 1, MAX_DUR = 6, PAUSE = 0.6, GAP = 0.04;
const seg = new Intl.Segmenter("th", { granularity: "word" });
const grapheme = new Intl.Segmenter("th", { granularity: "grapheme" });
const glen = (s) => [...grapheme.segment(s)].length;
const FILLER = /^(?:อืม+|เอ่อ+|เออ+|อ่า+|อา+|อึม+|เอ้อ+|ฮึ+|หืม+|อะ|เนาะ|ครับ|ค่ะ|คะ|นะครับ|นะคะ)$/u;
const SENT_END = /[.!?…。！？]$/;

function ts(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(r, 3)}`;
}

/** Split text into at most 2 lines, breaking only at spaces / Thai word boundaries. null if it cannot fit. */
function wrap(text) {
  text = text.replace(/\s+/g, " ").trim();
  if (glen(text) <= MAX_LINE) return [text];
  const parts = [...seg.segment(text)].map((s) => s.segment);
  let best = null;
  let left = "";
  for (let i = 0; i < parts.length - 1; i++) {
    left += parts[i];
    const right = parts.slice(i + 1).join("");
    const a = left.trim(), b = right.trim();
    if (!a || !b) continue;
    const la = glen(a), lb = glen(b);
    if (la > MAX_LINE || lb > MAX_LINE) continue;
    const score = Math.abs(la - lb) - (/\s$/.test(left) || /^\s/.test(right) ? 6 : 0);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best ? best.lines : null;
}

function build(j) {
  const all = (j.words || []).filter((w) => w.type !== "audio_event");
  const spaced = new Set();
  for (let i = 1; i < all.length; i++) if (all[i].type === "spacing" && all[i - 1].type === "word" && /\s/.test(all[i].text)) spaced.add(all[i - 1]);
  const units = all
    .filter((w) => w.type === "word" && w.text?.trim() !== "")
    .map((w) => ({ text: w.text.trim() + (spaced.has(w) ? " " : ""), start: w.start, end: w.end }));

  const textOf = (u) => u.map((x) => x.text).join("").replace(/\s+/g, " ").trim();
  const cues = [];
  let cur = null;
  const close = () => {
    if (cur) cues.push(cur);
    cur = null;
  };
  for (const u of units) {
    if (cur) {
      const gap = u.start - cur.end;
      const prevText = cur.units[cur.units.length - 1].text.trim();
      if (gap > PAUSE || SENT_END.test(prevText) || u.end - cur.start > MAX_DUR) close();
      else if (wrap(textOf([...cur.units, u])) === null) close();
    }
    if (!cur) cur = { start: u.start, end: u.end, units: [] };
    cur.units.push(u);
    cur.end = u.end;
  }
  close();

  // drop filler-only / punctuation-only cues
  const keep = cues.filter((c) => {
    const t = textOf(c.units).replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
    return t && t.split(" ").some((w) => !FILLER.test(w));
  });
  // merge too-short cues with the next one when close enough and it still fits
  const merged = [];
  for (const c of keep) {
    const p = merged[merged.length - 1];
    if (p && p.end - p.start < MIN_DUR && c.start - p.end <= PAUSE && c.end - p.start <= MAX_DUR && wrap(textOf([...p.units, ...c.units]))) {
      p.units.push(...c.units);
      p.end = c.end;
    } else merged.push(c);
  }
  // timing: stretch to min duration where room allows, never overlap
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i], next = merged[i + 1];
    let end = Math.max(c.end, c.start + MIN_DUR);
    if (next) end = Math.min(end, Math.max(c.end, next.start - GAP));
    if (next && end > next.start - GAP) end = Math.max(c.start + 0.2, next.start - GAP);
    c.end = end;
  }
  return merged
    .map((c) => ({ start: c.start, end: c.end, lines: wrap(textOf(c.units)) ?? [textOf(c.units)] }))
    .filter((c) => c.end > c.start);
}

const args = process.argv.slice(2);
let ids = args.filter((a) => !a.startsWith("--"));
if (args.includes("--all")) ids = (await readdir(WORK, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
if (!ids.length) {
  console.error("Give clip id(s) or --all.");
  process.exit(1);
}
for (const id of ids) {
  let j;
  try {
    j = JSON.parse(await readFile(path.join(clipDir(id), "scribe.json"), "utf8"));
  } catch {
    console.error(`skip  ${id}: no scribe.json (run transcribe.mjs first)`);
    continue;
  }
  const cues = build(j);
  const out = "WEBVTT\n\n" + cues.map((c) => `${ts(c.start)} --> ${ts(c.end)}\n${c.lines.join("\n")}`).join("\n\n") + "\n";
  await writeFile(path.join(clipDir(id), "captions.vtt"), out);
  console.log(`ok    ${id}: ${cues.length} cues`);
}
