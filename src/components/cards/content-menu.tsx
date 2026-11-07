"use client";
import * as React from "react";
import { Clock, EllipsisVertical, Link2, ListPlus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { useViewer } from "@/components/providers";
import { toggleSaveAction } from "@/app/actions";
import { copyLink, share } from "@/lib/stores/share";
import { contentHref } from "@/lib/format";
import type { Content } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddToPlaylistDialog } from "./add-to-playlist";

export async function saveForLater(id: string) {
  const r = await toggleSaveAction(id, true);
  if (!r.ok) return toast(r.error);
  toast("บันทึกไว้ดูภายหลังแล้ว", {
    action: { label: "เลิกทำ", onClick: () => void toggleSaveAction(id, false) },
  });
}

/** ⋮ menu: ดูภายหลัง · เพิ่มลง Playlist · แชร์ · คัดลอกลิงก์ */
export function ContentMenu({ content, className, dark }: { content: Content; className?: string; dark?: boolean }) {
  const { requireAuth, viewer } = useViewer();
  const [playlistOpen, setPlaylistOpen] = React.useState(false);
  const href = contentHref(content);
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            className={cn(
              "rounded-full p-1.5 text-text-2 opacity-100 transition-opacity hover:bg-hover hover:text-text focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 data-[state=open]:opacity-100",
              dark && "text-white/80 hover:bg-white/10 hover:text-white",
              className,
            )}
            aria-label="ตัวเลือกเพิ่มเติม"
            onClick={(e) => e.stopPropagation()}
          >
            <EllipsisVertical className="size-5" strokeWidth={1.75} />
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <DropdownItem onSelect={() => requireAuth("เข้าสู่ระบบเพื่อบันทึกไว้ดูภายหลัง") && saveForLater(content.id)}>
            <Clock /> ดูภายหลัง
          </DropdownItem>
          {viewer?.is_admin && (
            <DropdownItem onSelect={() => setPlaylistOpen(true)}>
              <ListPlus /> เพิ่มลง Playlist
            </DropdownItem>
          )}
          <DropdownItem onSelect={() => share({ title: content.title, path: href })}>
            <Share2 /> แชร์
          </DropdownItem>
          <DropdownItem onSelect={() => copyLink(href)}>
            <Link2 /> คัดลอกลิงก์
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      {playlistOpen && <AddToPlaylistDialog contentIds={[content.id]} onClose={() => setPlaylistOpen(false)} />}
    </>
  );
}
