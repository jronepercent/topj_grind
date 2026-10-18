"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clapperboard, CloudUpload, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createUploadAction } from "@/app/studio/actions";
import { TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";
import { useUploads } from "./upload-store";

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

/** Read width / height / duration from a local file via a hidden media element. */
function readMeta(file: File, kind: "video" | "audio") {
  return new Promise<{ width?: number; height?: number; duration?: number }>((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind);
    el.preload = "metadata";
    let done = false;
    const finish = (m: { width?: number; height?: number; duration?: number }) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(m);
    };
    el.onloadedmetadata = () =>
      finish({
        width: kind === "video" ? (el as HTMLVideoElement).videoWidth || undefined : undefined,
        height: kind === "video" ? (el as HTMLVideoElement).videoHeight || undefined : undefined,
        duration: Number.isFinite(el.duration) ? el.duration : undefined,
      });
    el.onerror = () => finish({});
    setTimeout(() => finish({}), 6000);
    el.src = url;
  });
}

export function UploadDropzone({ defaultType }: { defaultType: ContentType }) {
  const router = useRouter();
  const start = useUploads((s) => s.start);
  const [type, setType] = React.useState<ContentType>(defaultType === "podcast" ? "podcast" : "video");
  const [over, setOver] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setType(defaultType === "podcast" ? "podcast" : "video"), [defaultType]);

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    const isAudio = file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
    const isVideo = file.type.startsWith("video/") || VIDEO_EXT.test(file.name);
    if (!isAudio && !isVideo) {
      toast("รองรับเฉพาะไฟล์วิดีโอหรือไฟล์เสียง");
      return;
    }
    setBusy(file.name);
    const meta = await readMeta(file, isAudio ? "audio" : "video");
    const finalType: ContentType = isAudio ? "podcast" : "video";
    if (!isAudio && type === "podcast") toast("ไฟล์วิดีโอจะถูกอัปโหลดเป็นวิดีโอ พอดแคสต์ใช้ไฟล์เสียง");
    const r = await createUploadAction({
      type: finalType,
      fileName: file.name,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
    });
    if (!r.ok) {
      setBusy(null);
      toast(r.error);
      return;
    }
    start(r.data, file);
    router.push(`/studio/content/${r.data.id}/edit`);
  };

  const icons = { video: Clapperboard, podcast: Mic } as const;

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full border border-border p-1" role="radiogroup" aria-label="ประเภทที่จะอัปโหลด">
        {(["video", "podcast"] as const).map((t) => {
          const Icon = icons[t];
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                type === t ? "bg-text text-bg" : "text-text-2 hover:text-text",
              )}
            >
              <Icon className="size-4" aria-hidden /> {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-6 py-12 text-center transition-colors",
          over ? "border-text bg-hover" : "border-[var(--border-strong)] bg-surface",
        )}
      >
        {busy ? (
          <div className="w-full max-w-xs" aria-live="polite">
            <div className="skeleton mx-auto h-16 w-16 rounded-full" />
            <p className="mt-6 text-[15px] font-semibold">กำลังเตรียมไฟล์</p>
            <p className="t-meta mt-1 truncate">{busy}</p>
          </div>
        ) : (
          <>
            <span className="flex size-20 items-center justify-center rounded-full bg-hover">
              <CloudUpload className="size-9 text-text-2" strokeWidth={1.5} aria-hidden />
            </span>
            <p className="t-h2 mt-6">ลากไฟล์มาวาง หรือ เลือกไฟล์</p>
            <p className="t-meta mt-2 max-w-sm">
              {type === "podcast"
                ? "ไฟล์เสียง MP3, M4A หรือ WAV · อัปโหลดสูงสุด 2 GB และอัปโหลดต่อได้หากเน็ตหลุด"
                : "ไฟล์วิดีโอ MP4, MOV หรือ WebM"}
            </p>
            <Button variant="inverse" size="lg" className="mt-6" onClick={() => inputRef.current?.click()}>
              เลือกไฟล์
            </Button>
            <p className="t-caption mt-6 text-text-2">
              {type === "podcast" ? "ไฟล์เสียงจะอัปโหลดตรงไปยังที่เก็บส่วนตัวของเว็บ" : "ไฟล์จะอัปโหลดตรงไปยังที่เก็บวิดีโอ"} และอัปโหลดต่อได้หากเน็ตหลุด
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={type === "podcast" ? "audio/*" : "video/*,audio/*"}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handle(f);
          }}
        />
      </div>
    </div>
  );
}
