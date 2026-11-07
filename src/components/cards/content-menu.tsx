"use client";
import * as React from "react";
import { EllipsisVertical } from "lucide-react";
import { toast } from "sonner";
import { toggleSaveAction } from "@/app/actions";
import type { Content } from "@/lib/types";
import { cn } from "@/lib/utils";

export async function saveForLater(id: string) {
  const r = await toggleSaveAction(id, true);
  if (!r.ok) return toast(r.error);
  toast("บันทึกไว้ดูภายหลังแล้ว", {
    action: { label: "เลิกทำ", onClick: () => void toggleSaveAction(id, false) },
  });
}

export function menuButtonClass(className?: string, dark?: boolean) {
  return cn(
    "rounded-full p-1.5 text-text-2 opacity-100 transition-opacity hover:bg-hover hover:text-text focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 data-[state=open]:opacity-100",
    dark && "text-white/80 hover:bg-white/10 hover:text-white",
    className,
  );
}

// Radix DropdownMenu (+ Popper) is heavy and a home page mounts dozens of these, so the menu code is a separate chunk
// that is fetched on first hover/focus/touch and mounted (already open) on first activation.
const loadPopup = () => import("./content-menu-popup");
const Popup = React.lazy(loadPopup);

/** ⋮ menu: ดูภายหลัง · เพิ่มลง Playlist · แชร์ · คัดลอกลิงก์ */
export function ContentMenu({ content, className, dark }: { content: Content; className?: string; dark?: boolean }) {
  const [armed, setArmed] = React.useState(false);
  const plain = (
    <button
      type="button"
      className={menuButtonClass(className, dark)}
      aria-label="ตัวเลือกเพิ่มเติม"
      aria-haspopup="menu"
      aria-expanded={armed}
      onPointerEnter={() => void loadPopup()}
      onFocus={() => void loadPopup()}
      onTouchStart={() => void loadPopup()}
      onClick={(e) => {
        e.stopPropagation();
        setArmed(true);
      }}
    >
      <EllipsisVertical className="size-5" strokeWidth={1.75} />
    </button>
  );
  if (!armed) return plain;
  return (
    <React.Suspense fallback={plain}>
      <Popup content={content} className={className} dark={dark} />
    </React.Suspense>
  );
}
