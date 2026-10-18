"use client";
import { create } from "zustand";
import { toast } from "sonner";
import { mediaStatusAction, reuploadAction, uploadFinishedAction, type UploadTicket } from "@/app/studio/actions";
import { accessToken } from "@/lib/supabase/browser";

/**
 * Background upload manager. Lives outside React components so an upload keeps going
 * while the admin moves between Studio pages (client-side navigation keeps this module alive).
 */
export type UploadPhase = "uploading" | "processing" | "ready" | "failed";

export interface UploadJob {
  id: string;
  fileName: string;
  phase: UploadPhase;
  progress: number; // 0..1 while uploading
  file: File;
  error?: string;
}

interface UploadState {
  jobs: Record<string, UploadJob>;
  start: (ticket: UploadTicket, file: File) => void;
  reupload: (id: string, file: File) => Promise<boolean>;
  /** Stop an upload in progress. Choosing the same file again later resumes where it stopped. */
  cancel: (id: string) => void;
}

const aborters = new Map<string, () => void>();

/** Supabase Storage's resumable endpoint accepts exactly this chunk size. */
const SUPABASE_CHUNK = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000, 30000, 60000];

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

/** The extension is more reliable than file.type, which differs per browser / OS (and is sometimes empty). */
function audioContentType(file: File) {
  return AUDIO_MIME[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? (file.type || "audio/mpeg");
}

/** Length of a local audio file in seconds, read by the browser (undefined if it can't decode it). */
function readAudioDuration(file: File) {
  return new Promise<number | undefined>((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.preload = "metadata";
    let done = false;
    const finish = (d?: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(d && Number.isFinite(d) && d > 0 ? d : undefined);
    };
    el.onloadedmetadata = () => finish(el.duration);
    el.onerror = () => finish();
    setTimeout(finish, 8000);
    el.src = url;
  });
}

/** Thai message for a failed TUS request. */
function uploadErrorMessage(err: unknown) {
  const status = (err as { originalResponse?: { getStatus?: () => number } } | null)?.originalResponse?.getStatus?.();
  if (status === 413) return "ไฟล์ใหญ่เกินที่ Storage รับได้ (ตรวจ Upload file size limit ใน Supabase)";
  if (status === 401 || status === 403) return "ไม่มีสิทธิ์อัปโหลด กรุณาเข้าสู่ระบบใหม่";
  if (status === 415) return "Storage ไม่รับไฟล์ชนิดนี้";
  if (status === 409) return "มีไฟล์ชื่อนี้อยู่แล้ว ลองอัปโหลดใหม่";
  return "อัปโหลดไม่สำเร็จ";
}

// A long upload on a phone dies when the screen sleeps, so hold a wake lock while anything is uploading.
let wake: { release: () => Promise<void> } | null = null;
async function holdScreen(on: boolean) {
  try {
    if (on && !wake && document.visibilityState === "visible" && "wakeLock" in navigator) {
      wake = await navigator.wakeLock.request("screen");
    } else if (!on && wake) {
      const w = wake;
      wake = null;
      await w.release();
    }
  } catch {
    wake = null;
  }
}

export const useUploads = create<UploadState>((set, get) => {
  const patch = (id: string, p: Partial<UploadJob>) =>
    set((s) => (s.jobs[id] ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], ...p } } } : s));

  const settle = () => {
    if (!Object.values(get().jobs).some((j) => j.phase === "uploading")) void holdScreen(false);
  };
  const fail = (id: string, error: string) => {
    aborters.delete(id);
    patch(id, { phase: "failed", error });
    settle();
  };

  const poll = (id: string) => {
    const tick = async () => {
      const job = get().jobs[id];
      if (!job || job.phase !== "processing") return;
      const r = await mediaStatusAction(id).catch(() => null);
      if (r && r.ok) {
        if (r.data.media_status === "ready") {
          patch(id, { phase: "ready", progress: 1 });
          toast(`พร้อมแล้ว · ${job.fileName}`);
          return;
        }
        if (r.data.media_status === "failed") {
          patch(id, { phase: "failed", error: "ประมวลผลไม่สำเร็จ" });
          return;
        }
      }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  };

  const finished = async (id: string, info?: { objectName: string; duration_sec?: number }) => {
    patch(id, { phase: "processing", progress: 1 });
    aborters.delete(id);
    settle();
    // The bytes are already in Storage, so retry a flaky confirmation instead of making the admin upload again.
    let r: Awaited<ReturnType<typeof uploadFinishedAction>> | null = null;
    for (const wait of [0, 2000, 5000]) {
      if (wait) await new Promise((res) => setTimeout(res, wait));
      r = await uploadFinishedAction(id, info).catch(() => null);
      if (r) break;
    }
    if (!r || !r.ok) {
      patch(id, { phase: "failed", error: r && !r.ok ? r.error : "เชื่อมต่อไม่สำเร็จ" });
      return;
    }
    if (r.data === "ready") {
      patch(id, { phase: "ready" });
      if (info) toast(`อัปโหลดเสร็จแล้ว · ${get().jobs[id]?.fileName ?? ""}`);
    } else poll(id);
  };

  const runDemo = (id: string) => {
    // No storage provider configured: progress is paced locally, then the server marks the row ready.
    const total = 6000;
    const t0 = performance.now();
    let stopped = false;
    aborters.set(id, () => (stopped = true));
    const step = () => {
      if (stopped) return;
      const p = Math.min(1, (performance.now() - t0) / total);
      patch(id, { progress: p });
      if (p < 1) setTimeout(step, 120);
      else void finished(id);
    };
    step();
  };

  const runBunny = async (id: string, file: File, ticket: UploadTicket) => {
    const tus = await import("tus-js-client");
    const t = ticket.tus!;
    const upload = new tus.Upload(file, {
      endpoint: t.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: t.signature,
        AuthorizationExpire: String(t.expire),
        VideoId: t.videoId,
        LibraryId: t.libraryId,
      },
      metadata: { filetype: file.type, title: file.name },
      onProgress: (sent, total) => patch(id, { progress: total ? sent / total : 0 }),
      onError: (err) => {
        console.error(err);
        fail(id, "อัปโหลดไม่สำเร็จ");
      },
      onSuccess: () => void finished(id),
    });
    aborters.set(id, () => void upload.abort());
    // Resume if this exact file was partially uploaded before (network drop, tab reload).
    const previous = await upload.findPreviousUploads();
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  };

  /** Podcast audio → private Supabase Storage bucket over the resumable (TUS) endpoint. */
  const runSupabase = async (id: string, file: File, ticket: UploadTicket) => {
    const s = ticket.supabase!;
    const [tus, duration] = await Promise.all([import("tus-js-client"), readAudioDuration(file)]);
    // Object name goes in the metadata; it is swapped for the earlier name below if this file is being resumed.
    const metadata = { bucketName: s.bucket, objectName: s.objectName, contentType: audioContentType(file), cacheControl: "3600" };
    const upload = new tus.Upload(file, {
      endpoint: s.endpoint,
      retryDelays: RETRY_DELAYS,
      chunkSize: SUPABASE_CHUNK,
      headers: { "x-upsert": "false" },
      // The admin's access token is short-lived: fetch a fresh one for every request of a long upload.
      onBeforeRequest: async (req) => {
        req.setHeader("Authorization", `Bearer ${await accessToken()}`);
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata,
      onProgress: (sent, total) => patch(id, { progress: total ? sent / total : 0 }),
      onError: (err) => {
        console.error(err);
        fail(id, uploadErrorMessage(err));
      },
      onSuccess: () => void finished(id, { objectName: metadata.objectName, duration_sec: duration }),
    });
    aborters.set(id, () => void upload.abort());
    // Resume if this exact file was partially uploaded to THIS episode before (network drop, tab reload).
    const previous = await upload.findPreviousUploads();
    const resumable = previous.find((p) => p.metadata?.objectName?.startsWith(`episodes/${id}/`) && p.metadata.bucketName === s.bucket);
    if (resumable) {
      metadata.objectName = resumable.metadata.objectName;
      upload.resumeFromPreviousUpload(resumable);
    }
    upload.start();
  };

  return {
    jobs: {},
    start: (ticket, file) => {
      aborters.get(ticket.id)?.();
      set((s) => ({
        jobs: {
          ...s.jobs,
          [ticket.id]: { id: ticket.id, fileName: file.name, phase: "uploading", progress: 0, file },
        },
      }));
      const crash = (e: unknown) => {
        console.error(e);
        fail(ticket.id, e instanceof Error && e.message.startsWith("หมดเวลา") ? e.message : "อัปโหลดไม่สำเร็จ");
      };
      void holdScreen(true);
      if (ticket.mode === "supabase" && ticket.supabase) runSupabase(ticket.id, file, ticket).catch(crash);
      else if (ticket.mode === "bunny" && ticket.tus) runBunny(ticket.id, file, ticket).catch(crash);
      else runDemo(ticket.id);
    },
    reupload: async (id, file) => {
      const r = await reuploadAction(id, file.name);
      if (!r.ok) {
        toast(r.error);
        return false;
      }
      get().start(r.data, file);
      return true;
    },
    cancel: (id) => {
      if (get().jobs[id]?.phase !== "uploading") return;
      aborters.get(id)?.();
      fail(id, "ยกเลิกการอัปโหลดแล้ว");
    },
  };
});

// Phones drop the wake lock when the tab is hidden; take it again when the admin comes back mid-upload.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Object.values(useUploads.getState().jobs).some((j) => j.phase === "uploading")) void holdScreen(true);
  });
}

export function activeUploads(jobs: Record<string, UploadJob>) {
  return Object.values(jobs).filter((j) => j.phase === "uploading" || j.phase === "processing");
}
