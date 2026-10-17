"use client";
import * as React from "react";
import { toast } from "sonner";
import { CircleCheck, Clock, Headphones, Lock, RotateCcw, TriangleAlert, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, inputClass } from "@/components/ui/misc";
import { imageUploadAction, mediaStatusAction } from "@/app/studio/actions";
import { formatDuration } from "@/lib/format";
import { parseChapters, tokenize } from "@/lib/richtext";
import { cn } from "@/lib/utils";
import type { ContentType, MediaStatus, Visibility } from "@/lib/types";
import { useUploads } from "./upload-store";

// ───────── Time helpers (Asia/Bangkok, UTC+7, no DST) ─────────
const BKK = 7 * 3_600_000;
/** ISO → value for <input type="datetime-local"> shown in Bangkok time. */
export function isoToBkkInput(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + BKK).toISOString().slice(0, 16);
}
/** "YYYY-MM-DDTHH:mm" typed in Bangkok time → ISO. */
export function bkkInputToIso(v: string) {
  return new Date(`${v}:00+07:00`).toISOString();
}
export function bkkClock(iso: string) {
  return isoToBkkInput(iso).slice(11, 16);
}

export function secToMmss(sec: number | null | undefined) {
  if (sec == null) return "";
  return formatDuration(sec);
}
/** "1:23" / "1:02:03" / "83" → seconds. "" → null. undefined = invalid. */
export function mmssToSec(v: string): number | null | undefined {
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  if (!/^(\d{1,2}:)?\d{1,3}:[0-5]\d$/.test(t)) return undefined;
  return t.split(":").map(Number).reduce((a, p) => a * 60 + p, 0);
}

// ───────── Media status strip ─────────
export type MediaPhase = MediaStatus | "interrupted";

export function useMediaPhase(id: string, initial: MediaStatus) {
  const job = useUploads((s) => s.jobs[id]);
  const [server, setServer] = React.useState<MediaStatus>(initial);
  React.useEffect(() => {
    if (job || server !== "processing") return;
    let alive = true;
    const t = setInterval(async () => {
      const r = await mediaStatusAction(id).catch(() => null);
      if (alive && r?.ok && r.data.media_status !== "processing") setServer(r.data.media_status);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, job, server]);
  if (job) return { phase: job.phase as MediaPhase, progress: job.progress, fileName: job.fileName, error: job.error };
  return { phase: (server === "uploading" ? "interrupted" : server) as MediaPhase, progress: 0, fileName: null, error: undefined };
}

export function MediaStrip({ id, initial, type }: { id: string; initial: MediaStatus; type: ContentType }) {
  const { phase, progress, fileName, error } = useMediaPhase(id, initial);
  const reupload = useUploads((s) => s.reupload);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pct = Math.round(progress * 100);
  const accept = type === "podcast" ? "audio/*" : "video/*";

  const label =
    phase === "uploading"
      ? `อัปโหลด ${pct}%`
      : phase === "processing"
        ? "กำลังประมวลผล"
        : phase === "ready"
          ? "พร้อม"
          : phase === "failed"
            ? "ล้มเหลว — อัปโหลดใหม่"
            : "การอัปโหลดยังไม่เสร็จ";
  const sub =
    phase === "uploading"
      ? "กรอกรายละเอียดด้านล่างไปพร้อมกันได้เลย ระบบบันทึกให้อัตโนมัติ"
      : phase === "processing"
        ? "ปิดหน้านี้ได้ ระบบจะเผยแพร่ให้อัตโนมัติเมื่อพร้อม (ถ้าเลือกเผยแพร่ทันที)"
        : phase === "ready"
          ? type === "podcast"
            ? "ไฟล์เสียงพร้อมเผยแพร่"
            : "วิดีโอพร้อมเผยแพร่"
          : phase === "failed"
            ? (error ?? "ไฟล์มีปัญหา") + " · รายละเอียดที่กรอกไว้ยังอยู่ครบ"
            : "เลือกไฟล์เดิมอีกครั้งเพื่ออัปโหลดต่อ รายละเอียดที่กรอกไว้ยังอยู่ครบ";

  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-3",
        phase === "failed" ? "border-danger/40 bg-danger/[0.06]" : "border-border bg-surface",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="shrink-0 [&_svg]:size-5" aria-hidden>
          {phase === "ready" ? (
            <CircleCheck className="text-success" />
          ) : phase === "failed" ? (
            <TriangleAlert className="text-danger" />
          ) : phase === "interrupted" ? (
            <Upload className="text-text-2" />
          ) : (
            <Clock className="text-text-2" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="tnum text-[14px] font-semibold">
            {label}
            {fileName && phase === "uploading" && <span className="ml-2 font-normal text-text-2">{fileName}</span>}
          </p>
          <p className="t-caption text-text-2">{sub}</p>
        </div>
        {(phase === "failed" || phase === "interrupted") && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="sr-only"
              tabIndex={-1}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f && (await reupload(id, f))) toast("เริ่มอัปโหลดใหม่แล้ว");
              }}
            />
            <Button size="sm" variant={phase === "failed" ? "danger" : "outline"} onClick={() => fileRef.current?.click()}>
              <RotateCcw /> {phase === "failed" ? "อัปโหลดใหม่" : "เลือกไฟล์"}
            </Button>
          </>
        )}
      </div>
      {(phase === "uploading" || phase === "processing") && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-hover" aria-hidden>
          <div
            className={cn("h-full rounded-full bg-accent transition-[width] duration-300", phase === "processing" && "w-full animate-pulse opacity-60")}
            style={phase === "uploading" ? { width: `${pct}%` } : undefined}
          />
        </div>
      )}
    </div>
  );
}

// ───────── Rich description preview (never innerHTML) ─────────
export function DescriptionPreview({ text }: { text: string }) {
  if (!text.trim()) return <p className="t-meta">พรีวิวจะแสดงตรงนี้ ลิงก์ #แท็ก และเวลา เช่น 1:23 จะกดได้</p>;
  const tokens = tokenize(text);
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-6">
      {tokens.map((t, i) => {
        if (t.kind === "url")
          return (
            <a key={i} href={t.value} target="_blank" rel="noopener noreferrer nofollow" className="text-text underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-current">
              {t.value}
            </a>
          );
        if (t.kind === "tag")
          return (
            <span key={i} className="font-medium text-text-2">
              {t.value}
            </span>
          );
        if (t.kind === "time")
          return (
            <button
              key={i}
              type="button"
              onClick={() => toast(`ผู้ชมกดแล้วจะข้ามไปที่ ${t.value}`)}
              className="tnum mx-0.5 inline-flex rounded-full bg-hover px-1.5 text-[13px] font-medium leading-5 hover:bg-[var(--border-strong)]"
              aria-label={`ข้ามไปที่ ${t.value}`}
            >
              {t.value}
            </button>
          );
        return <React.Fragment key={i}>{t.value}</React.Fragment>;
      })}
    </p>
  );
}

const CHAPTER_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—|]?\s*(.+?)\s*$/;

export function ChaptersPreview({ description }: { description: string }) {
  const chapters = parseChapters(description);
  if (chapters.length)
    return (
      <ol className="space-y-1">
        {chapters.map((c) => (
          <li key={c.start_sec} className="flex gap-3 text-[14px]">
            <span className="tnum w-14 shrink-0 font-medium text-text-2">{formatDuration(c.start_sec)}</span>
            <span className="min-w-0 truncate">{c.title}</span>
          </li>
        ))}
      </ol>
    );
  const lines = description.split(/\r?\n/).filter((l) => CHAPTER_LINE.test(l));
  let hint = "พิมพ์บรรทัดที่ขึ้นต้นด้วยเวลาในคำอธิบาย เช่น “0:00 บทนำ” อย่างน้อย 3 บรรทัด ระบบจะสร้าง Chapters ให้อัตโนมัติ";
  if (lines.length) {
    const first = lines[0].match(CHAPTER_LINE)![1];
    if (first !== "0:00" && first !== "00:00") hint = `Chapter แรกต้องเริ่มที่ 0:00 (ตอนนี้เริ่มที่ ${first})`;
    else if (lines.length < 3) hint = `ต้องมีอย่างน้อย 3 รายการ (ตอนนี้มี ${lines.length})`;
    else hint = "เวลาต้องเรียงจากน้อยไปมาก และไม่ซ้ำกัน";
  }
  return <p className="t-meta">{hint}</p>;
}

// ───────── Tag chip input ─────────
export function TagInput({ value, onChange, max = 10 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p) && next.length < max) next.push(p.slice(0, 40));
    if (next.length >= max && parts.length + value.length > max) toast(`ใส่แท็กได้สูงสุด ${max} แท็ก`);
    onChange(next);
    setDraft("");
  };
  return (
    <div className={cn(inputClass, "flex min-h-[46px] flex-wrap items-center gap-1.5 py-2")}>
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-hover py-0.5 pl-2.5 pr-1 text-[13px]">
          #{t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="rounded-full p-0.5 text-text-2 hover:bg-[var(--border-strong)] hover:text-text" aria-label={`ลบแท็ก ${t}`}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {value.length < max && (
        <input
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? "" : "พิมพ์แล้วกด Enter"}
          aria-label="เพิ่มแท็ก"
          className="min-w-[120px] flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-2"
        />
      )}
    </div>
  );
}

// ───────── Cover frames from the local video file ─────────
function once(el: HTMLMediaElement, ev: string, ms = 8000) {
  return new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    el.addEventListener(ev, () => (clearTimeout(t), res()), { once: true });
    el.addEventListener("error", () => (clearTimeout(t), rej(new Error("decode"))), { once: true });
  });
}

/** Pick 3 frames at random points within each third of the clip and render them to JPEG data URLs. */
export async function captureFrames(file: File, count = 3): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await once(v, "loadeddata");
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0) throw new Error("no duration");
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      v.currentTime = Math.min(d - 0.1, ((i + 0.2 + Math.random() * 0.6) / count) * d);
      await once(v, "seeked");
      const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      out.push(c.toDataURL("image/jpeg", 0.82));
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
    v.load();
  }
}

/** Send a picked image file straight to Storage (any size) and resolve to its public URL. */
export async function uploadImageFile(file: File, folder: "content" | "playlists" | "channel" | "hero") {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("รองรับเฉพาะ JPG, PNG หรือ WebP");
  const t = toast.loading("กำลังอัปโหลดรูป…");
  try {
    const r = await imageUploadAction(folder, file.type);
    if (!r.ok) throw new Error(r.error);
    const res = await fetch(r.data.uploadUrl, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "false" }, body: file });
    if (!res.ok) throw new Error(res.status === 413 ? "ไฟล์ใหญ่เกินที่ Storage รับได้" : "อัปโหลดรูปไม่สำเร็จ");
    return r.data.publicUrl;
  } finally {
    toast.dismiss(t);
  }
}

export function imageSize(src: string) {
  return new Promise<{ w: number; h: number }>((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = rej;
    img.src = src;
  });
}

// ───────── Home card preview ─────────
export function CardPreview({
  type,
  title,
  thumb,
  duration,
  visibility,
  channelName,
  channelAvatar,
}: {
  type: ContentType;
  title: string;
  thumb: string | null;
  duration: number;
  visibility: Visibility;
  channelName: string;
  channelAvatar: string | null;
}) {
  const t = title.trim() || "ชื่อคลิปจะแสดงตรงนี้";
  const badge = visibility === "members" && (
    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#E8C77A] backdrop-blur">
      <Lock className="size-3" strokeWidth={2.25} aria-hidden /> สมาชิก
    </span>
  );
  const img = thumb ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumb} alt="" className="absolute inset-0 size-full object-cover" />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-2">ยังไม่มีภาพปก</div>
  );
  if (type === "short")
    return (
      <div className="relative aspect-[9/16] w-[150px] overflow-hidden rounded-[12px] bg-elevated">
        {img}
        {badge}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2.5 pt-10">
          <p className="line-clamp-2 text-[13px] font-semibold leading-[18px] text-white">{t}</p>
          <p className="mt-0.5 text-[11px] text-white/70">การดู 0 ครั้ง</p>
        </div>
      </div>
    );
  if (type === "podcast")
    return (
      <div className="w-[200px]">
        <div className="relative aspect-square overflow-hidden rounded-[12px] bg-elevated">
          {img}
          {badge}
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Headphones className="size-3" /> พอดแคสต์
          </span>
        </div>
        <p className="mt-2.5 line-clamp-2 text-[14px] font-semibold leading-5">{t}</p>
        <p className="t-meta tnum mt-0.5">{formatDuration(duration)} · เมื่อสักครู่</p>
      </div>
    );
  return (
    <div className="w-full max-w-[320px]">
      <div className="relative aspect-video overflow-hidden rounded-[12px] bg-elevated">
        {img}
        {badge}
        {duration > 0 && (
          <span className="tnum absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[12px] font-medium text-white">{formatDuration(duration)}</span>
        )}
      </div>
      <div className="mt-3 flex gap-2.5">
        <Avatar src={channelAvatar} name={channelName} size={32} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[15px] font-semibold leading-[21px]">{t}</p>
          <p className="t-meta tnum mt-1">
            {channelName} · การดู 0 ครั้ง · เมื่อสักครู่
          </p>
        </div>
      </div>
    </div>
  );
}
