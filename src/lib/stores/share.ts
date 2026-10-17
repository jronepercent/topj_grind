"use client";
import { create } from "zustand";
import { toast } from "sonner";

interface ShareTarget {
  title: string;
  path: string;
  /** current playback time, offered as "เริ่มที่ 12:34" */
  time?: number;
}

export const useShareStore = create<{ target: ShareTarget | null; set: (t: ShareTarget | null) => void }>((set) => ({
  target: null,
  set: (target) => set({ target }),
}));

export function absoluteUrl(path: string) {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

/** Web Share API on mobile, copy-link modal on desktop. */
export async function share(target: ShareTarget) {
  const url = absoluteUrl(target.path);
  const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (isTouch && navigator.share) {
    try {
      await navigator.share({ title: target.title, url });
      return;
    } catch {
      return; // user cancelled
    }
  }
  useShareStore.getState().set(target);
}

export async function copyLink(path: string) {
  try {
    await navigator.clipboard.writeText(absoluteUrl(path));
    toast("คัดลอกลิงก์แล้ว");
  } catch {
    toast("คัดลอกไม่สำเร็จ");
  }
}
