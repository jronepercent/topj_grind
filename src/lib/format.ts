const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TZ = "Asia/Bangkok";

function trim(n: number) {
  const s = n >= 10 ? n.toFixed(0) : n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** 1.2 พัน · 3.4 หมื่น · 1.1 แสน · 2.5 ล้าน */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${trim(n / 1000)} พัน`;
  if (n < 100_000) return `${trim(n / 10_000)} หมื่น`;
  if (n < 1_000_000) return `${trim(n / 100_000)} แสน`;
  return `${trim(n / 1_000_000)} ล้าน`;
}

export function formatNumber(n: number) {
  return n.toLocaleString("th-TH");
}

/** Parts of a date in Asia/Bangkok. */
function bkkParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: p.hour, min: p.minute };
}

/** 17 ต.ค. 2026 */
export function thaiDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const p = bkkParts(new Date(iso));
  return `${p.d} ${TH_MONTHS[p.m - 1]} ${p.y}`;
}

export function thaiDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const p = bkkParts(new Date(iso));
  return `${p.d} ${TH_MONTHS[p.m - 1]} ${p.y} ${p.h}:${p.min} น.`;
}

/** เมื่อสักครู่ · 5 นาทีที่แล้ว · 3 วันที่แล้ว · 17 ต.ค. 2026 */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "เมื่อสักครู่";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)} นาทีที่แล้ว`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)} ชั่วโมงที่แล้ว`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)} วันที่แล้ว`;
  if (d < 30) return `${Math.floor(d / 7)} สัปดาห์ที่แล้ว`;
  return thaiDate(iso);
}

/** 12:34 or 1:02:03 */
export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "1 ชม. 20 นาที" */
export function formatLongDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} นาที`;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

export function parseTimestamp(t: string): number {
  const parts = t.split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function daysUntil(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return -1;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const TYPE_LABEL = { video: "วิดีโอ", short: "Shorts", podcast: "พอดแคสต์" } as const;

export function contentHref(c: { id: string; type: string }) {
  if (c.type === "short") return "/community"; // Shorts were replaced by ชุมชน
  if (c.type === "podcast") return `/podcasts/${c.id}`;
  return `/watch/${c.id}`;
}
