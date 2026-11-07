"use client";
import * as React from "react";
import { Clock, EllipsisVertical, Link2, ListPlus, Share2 } from "lucide-react";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { useViewer } from "@/components/providers";
import { copyLink, share } from "@/lib/stores/share";
import { contentHref } from "@/lib/format";
import type { Content } from "@/lib/types";
import { AddToPlaylistDialog } from "./add-to-playlist";
import { menuButtonClass, saveForLater } from "./content-menu";

/** The real Radix menu. Loaded on first activation only (see ContentMenu), so it opens straight away (defaultOpen). */
export default function ContentMenuPopup({ content, className, dark }: { content: Content; className?: string; dark?: boolean }) {
  const { requireAuth, viewer } = useViewer();
  const [playlistOpen, setPlaylistOpen] = React.useState(false);
  const href = contentHref(content);
  return (
    <>
      <Dropdown defaultOpen>
        <DropdownTrigger asChild>
          <button className={menuButtonClass(className, dark)} aria-label="ตัวเลือกเพิ่มเติม" onClick={(e) => e.stopPropagation()}>
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
