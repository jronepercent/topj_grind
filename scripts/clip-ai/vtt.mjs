// Usage: node scripts/clip-ai/vtt.mjs <id…|--all>   (no env needed; reads .clip-ai/<id>/scribe.json)
// Scribe returns Thai as syllable/character tokens, so we first glue tokens into phrases, segment phrases into
// real words (Intl.Segmenter), then pack words into short, airy cues (1 line preferred, 2 max).
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { WORK, clipDir } from "./lib.mjs";

const LINE = 34, IDEAL_TOTAL = 40, MIN_DUR = 0.8, MAX_DUR = 6, PAUSE_BREAK = 0.6, PHRASE_GAP = 0.35, GAP = 0.04;
const wordSeg = new Intl.Segmenter("th", { granularity: "word" });
const graphSeg = new Intl.Segmenter("th", { granularity: "grapheme" });
const glen = (s) => [...graphSeg.segment(s)].length;
const FILLER = /^(?:อืม+|เอ่อ+|เออ+|อ่า+|อา+|อึม+|เอ้อ+|ฮึ+|หืม+|อะ|เนาะ|ครับ|คับ|ค่ะ|คะ|นะครับ|นะคะ)$/u;
const PARTICLE_END = /(?:ครับ|คับ|ค่ะ|คะ|นะ|เลย|แล้ว|ด้วย)$/u;
const ATTACH = /^[ะ-ฺๅ-๎ๆ]/u; // vowel/tone/mark/ๆ that must stay with the previous glyph

function ts(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(r, 3)}`;
}

const script = (t) => (/[฀-๿]/.test(t) ? "th" : /[A-Za-z0-9]/.test(t) ? "en" : "");

/** Scribe tokens -> phrases [{ text, tokens, map, spaceBefore, gapBefore }] */
function toPhrases(words) {
  const phrases = [];
  let cur = null, sawSpace = false, lastEnd = null, lastScript = "";
  const flush = () => {
    if (cur) phrases.push(cur);
    cur = null;
  };
  for (const w of words) {
    if (w.type === "audio_event") continue;
    const raw = w.text ?? "";
    if (w.type === "spacing" || raw.trim() === "") {
      sawSpace = true;
      continue;
    }
    const text = raw.trim();
    const sc = script(text);
    const gap = lastEnd == null ? 0 : w.start - lastEnd;
    const scriptChange = cur && sc && lastScript && sc !== lastScript;
    const attach = ATTACH.test(text); // a stray vowel/tone token must stay glued to the consonant before it
    if (cur && !attach && (sawSpace || gap > PHRASE_GAP || scriptChange)) flush();
    if (cur) sawSpace = false;
    if (!cur) {
      cur = { text: "", tokens: [], map: [], spaceBefore: phrases.length > 0 && (sawSpace || gap > PHRASE_GAP), gapBefore: lastEnd == null ? Infinity : gap };
      sawSpace = false;
    }
    const ti = cur.tokens.length;
    cur.tokens.push({ start: w.start, end: w.end });
    for (let k = 0; k < text.length; k++) cur.map.push(ti);
    cur.text += text;
    lastEnd = w.end;
    if (sc) lastScript = sc;
  }
  flush();
  return phrases;
}

/** phrases -> flat word units with boundary ranks. */
function toUnits(phrases) {
  const units = [];
  phrases.forEach((p, pi) => {
    let parts = [];
    for (const s of wordSeg.segment(p.text)) {
      if (parts.length && ATTACH.test(s.segment)) {
        const prev = parts[parts.length - 1];
        prev.text += s.segment;
        prev.len += s.segment.length;
      } else parts.push({ index: s.index, text: s.segment, len: s.segment.length });
    }
    parts.forEach((part, k) => {
      const first = k === 0, last = k === parts.length - 1;
      units.push({
        text: part.text,
        start: p.tokens[p.map[part.index]].start,
        end: p.tokens[p.map[part.index + part.len - 1]].end,
        spaceBefore: first && p.spaceBefore,
        phraseStart: first,
        phraseEnd: last,
        particle: last && PARTICLE_END.test(p.text),
      });
    });
  });
  // rank of the boundary AFTER unit k: 1 pause, 2 particle, 3 phrase, 4 inside phrase (Infinity after last)
  units.forEach((u, k) => {
    const n = units[k + 1];
    if (!n) u.rank = 0;
    else if (n.start - u.end >= PAUSE_BREAK) u.rank = 1;
    else if (u.phraseEnd) u.rank = u.particle ? 2 : 3;
    else u.rank = 4;
  });
  let c = 0;
  for (const u of units) {
    u.glen = glen(u.text);
    u.ulen = u.glen + (u.spaceBefore ? 1 : 0);
    c += u.ulen;
    u.cum = c;
  }
  return units;
}

const join = (us) => us.map((u, k) => (k && u.spaceBefore ? " " : "") + u.text).join("").trim();

/** Best 1- or 2-line layout for units; null if impossible. Lengths come from precomputed per-unit grapheme counts. */
function layout(us) {
  const len = (x, y) => us.slice(x, y).reduce((t, u, k) => t + u.glen + (k && u.spaceBefore ? 1 : 0), 0);
  const g = len(0, us.length);
  if (g <= LINE) return { lines: [join(us)], g, cost: 0 };
  let best = null;
  for (let k = 0; k < us.length - 1; k++) {
    const la = len(0, k + 1), lb = len(k + 1, us.length);
    if (la > LINE || lb > LINE) continue;
    const score = Math.abs(la - lb) * 0.3 + (us[k].phraseEnd ? 0 : 100);
    if (!best || score < best.score) best = { score, k };
  }
  if (!best) return null;
  return { lines: [join(us.slice(0, best.k + 1)), join(us.slice(best.k + 1))], g, cost: 10 + (best.score >= 100 ? 5 : 0) + Math.max(0, g - IDEAL_TOTAL) * 3 };
}

function cuesFromUnits(units) {
  const n = units.length;
  const f = new Array(n + 1).fill(Infinity);
  const back = new Array(n + 1).fill(-1);
  const lay = new Array(n + 1);
  f[0] = 0;
  for (let i = 0; i < n; i++) {
    if (f[i] === Infinity) continue;
    for (let j = i; j < n; j++) {
      // cue = units[i..j]; never cross a pause >= 0.6 s
      if (j > i && units[j - 1].rank === 1) break;
      if (j > i && units[j].end - units[i].start > MAX_DUR) break;
      const approx = units[j].cum - units[i].cum + units[i].ulen;
      if (j > i && approx > LINE * 2 + 2) break;
      const us = units.slice(i, j + 1);
      const l = layout(us);
      if (!l && j > i) continue;
      const L = l ?? { lines: [join(us)], g: units[j].cum - units[i].cum + units[i].ulen, cost: 40 };
      let cost = 8 + L.cost;
      const dur = units[j].end - units[i].start;
      if (dur < MIN_DUR) cost += (MIN_DUR - dur) * 8;
      for (let k = i; k < j; k++) if (units[k].rank === 2) cost += 6;
      const text = L.lines.join("");
      if (FILLER.test(text.replace(/\s+/g, ""))) cost += 30;
      if (j < n - 1) cost += units[j].rank <= 2 ? 0 : units[j].rank === 3 ? 3 : 14;
      const v = f[i] + cost;
      if (v < f[j + 1]) {
        f[j + 1] = v;
        back[j + 1] = i;
        lay[j + 1] = L;
      }
    }
  }
  const cues = [];
  for (let j = n; j > 0; j = back[j]) {
    const i = back[j];
    cues.push({ start: units[i].start, end: units[j - 1].end, lines: lay[j].lines });
  }
  return cues.reverse();
}

function build(j) {
  const units = toUnits(toPhrases(j.words || []));
  if (!units.length) return [];
  let cues = cuesFromUnits(units);
  // drop filler-only / punctuation-only cues
  cues = cues.filter((c) => {
    const t = c.lines.join(" ").replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
    return t && t.split(" ").some((w) => !FILLER.test(w));
  });
  // timing: stretch to min duration where room allows, never overlap
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i], next = cues[i + 1];
    let end = Math.max(c.end, c.start + MIN_DUR);
    if (next) end = Math.min(end, Math.max(c.end, next.start - GAP));
    if (next && end > next.start - GAP) end = Math.max(c.start + 0.2, next.start - GAP);
    c.end = Math.min(end, c.start + MAX_DUR);
  }
  return cues.filter((c) => c.end > c.start);
}

{
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
}
