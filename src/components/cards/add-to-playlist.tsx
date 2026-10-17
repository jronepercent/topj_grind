"use client";
import * as React from "react";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listPlaylistsAction, setPlaylistMembershipAction } from "@/app/studio/actions";

/** Admin-only: add one or many clips to playlists. */
export function AddToPlaylistDialog({ contentIds, onClose }: { contentIds: string[]; onClose: () => void }) {
  const [items, setItems] = React.useState<{ id: string; title: string; visibility: string; containsAll: boolean }[] | null>(null);
  React.useEffect(() => {
    listPlaylistsAction(contentIds).then((r) => r.ok && setItems(r.data));
  }, [contentIds]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>เพิ่มลง Playlist</DialogTitle>
        <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
          {items === null
            ? [0, 1].map((i) => <div key={i} className="skeleton h-10 rounded-[10px]" />)
            : items.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-hover">
                  <input
                    type="checkbox"
                    defaultChecked={p.containsAll}
                    className="size-4 accent-[var(--accent)]"
                    onChange={async (e) => {
                      const r = await setPlaylistMembershipAction(p.id, contentIds, e.target.checked);
                      toast(r.ok ? (e.target.checked ? `เพิ่มลง "${p.title}" แล้ว` : `นำออกจาก "${p.title}" แล้ว`) : r.error);
                    }}
                  />
                  <span className="flex-1 truncate text-[14px]">{p.title}</span>
                  {p.visibility === "members" && <Lock className="size-4 text-member" />}
                </label>
              ))}
        </div>
        <Button asChild variant="ghost" className="mt-3 w-full justify-start">
          <Link href="/studio/playlists?new=1">
            <Plus /> สร้าง Playlist ใหม่
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
