"use client";
import { create } from "zustand";
import { toast } from "sonner";
import { mediaStatusAction, reuploadAction, uploadFinishedAction, type UploadTicket } from "@/app/studio/actions";

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
  suggestedShort: boolean;
  error?: string;
}

interface UploadState {
  jobs: Record<string, UploadJob>;
  start: (ticket: UploadTicket, file: File, opts?: { suggestedShort?: boolean }) => void;
  reupload: (id: string, file: File) => Promise<boolean>;
  dismissSuggestion: (id: string) => void;
}

const aborters = new Map<string, () => void>();

export const useUploads = create<UploadState>((set, get) => {
  const patch = (id: string, p: Partial<UploadJob>) =>
    set((s) => (s.jobs[id] ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], ...p } } } : s));

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

  const finished = async (id: string) => {
    patch(id, { phase: "processing", progress: 1 });
    aborters.delete(id);
    const r = await uploadFinishedAction(id).catch(() => null);
    if (!r || !r.ok) {
      patch(id, { phase: "failed", error: r && !r.ok ? r.error : "เชื่อมต่อไม่สำเร็จ" });
      return;
    }
    if (r.data === "ready") patch(id, { phase: "ready" });
    else poll(id);
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
        patch(id, { phase: "failed", error: "อัปโหลดไม่สำเร็จ" });
      },
      onSuccess: () => void finished(id),
    });
    aborters.set(id, () => void upload.abort());
    // Resume if this exact file was partially uploaded before (network drop, tab reload).
    const previous = await upload.findPreviousUploads();
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  };

  return {
    jobs: {},
    start: (ticket, file, opts) => {
      aborters.get(ticket.id)?.();
      set((s) => ({
        jobs: {
          ...s.jobs,
          [ticket.id]: {
            id: ticket.id,
            fileName: file.name,
            phase: "uploading",
            progress: 0,
            file,
            suggestedShort: !!opts?.suggestedShort,
          },
        },
      }));
      if (ticket.mode === "bunny" && ticket.tus) {
        runBunny(ticket.id, file, ticket).catch((e) => {
          console.error(e);
          patch(ticket.id, { phase: "failed", error: "อัปโหลดไม่สำเร็จ" });
        });
      } else runDemo(ticket.id);
    },
    reupload: async (id, file) => {
      const r = await reuploadAction(id);
      if (!r.ok) {
        toast(r.error);
        return false;
      }
      const prev = get().jobs[id];
      get().start(r.data, file, { suggestedShort: false });
      if (prev) patch(id, { suggestedShort: false });
      return true;
    },
    dismissSuggestion: (id) => patch(id, { suggestedShort: false }),
  };
});

export function activeUploads(jobs: Record<string, UploadJob>) {
  return Object.values(jobs).filter((j) => j.phase === "uploading" || j.phase === "processing");
}
