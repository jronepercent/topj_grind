"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, ImagePlus, ListVideo, Lock, Pencil, Plus, Trash, X } from "lucide-react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, inputClass } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { deletePlaylistAction, reorderPlaylistsAction, savePlaylistAction } from "@/app/studio/actions";
import { formatDuration, formatNumber, TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Visibility } from "@/lib/types";
import type { PickItem } from "./types";
import { SortableItem, SortableList } from "./sortable";
import { ContentPickerList } from "./content-picker";
import { ConfirmDialog } from "./confirm";
import { StudioThumb } from "./ui";
import { uploadImageFile } from "./editor-parts";

export interface StudioPlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  visibility: Visibility;
  is_course: boolean;
  content_ids: string[];
}

type Draft = Omit<StudioPlaylist, "id"> & { id: string | null };
const EMPTY: Draft = { id: null, title: "", description: "", thumbnail_url: null, visibility: "public", is_course: false, content_ids: [] };

export function PlaylistsManager({ playlists: initial, items, openNew }: { playlists: StudioPlaylist[]; items: PickItem[]; openNew: boolean }) {
  const router = useRouter();
  const [list, setList] = React.useState(initial);
  React.useEffect(() => setList(initial), [initial]);
  const [editing, setEditing] = React.useState<Draft | null>(openNew ? { ...EMPTY } : null);
  const [toDelete, setToDelete] = React.useState<StudioPlaylist | null>(null);
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // "+ สร้าง → สร้าง Playlist" while already on this page
  React.useEffect(() => {
    if (openNew) setEditing((e) => e ?? { ...EMPTY });
  }, [openNew]);

  const close = () => {
    setEditing(null);
    if (openNew) router.replace("/studio/playlists", { scroll: false });
  };

  const reorder = async (next: StudioPlaylist[]) => {
    const prev = list;
    setList(next);
    const r = await reorderPlaylistsAction(next.map((p) => p.id));
    if (!r.ok) {
      setList(prev);
      toast(r.error);
    } else toast("บันทึกลำดับแล้ว");
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="inverse" onClick={() => setEditing({ ...EMPTY })}>
          <Plus /> สร้าง Playlist
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="ยังไม่มี Playlist"
          body="รวมคลิปเป็นชุด หรือทำเป็นซีรีส์บทเรียนให้ผู้เรียนดูตามลำดับ"
          action={
            <Button variant="inverse" onClick={() => setEditing({ ...EMPTY })}>
              <Plus /> สร้าง Playlist แรก
            </Button>
          }
        />
      ) : (
        <>
          <p className="t-meta mb-3">ลากเพื่อเรียงลำดับการแสดงบนหน้าเว็บ</p>
          <SortableList items={list} getId={(p) => p.id} onReorder={reorder} className="space-y-2" label="เรียงลำดับ Playlist">
            {(p) => {
              const first = p.content_ids.map((id) => byId.get(id)).find(Boolean);
              const total = p.content_ids.reduce((s, id) => s + (byId.get(id)?.duration_sec ?? 0), 0);
              return (
                <SortableItem key={p.id} id={p.id} className="rounded-[16px] border border-border bg-surface p-2 pr-3" handleLabel={`ลากเพื่อย้าย ${p.title}`}>
                  <button type="button" onClick={() => setEditing({ ...p })} className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] text-left">
                    <StudioThumb src={p.thumbnail_url ?? first?.thumbnail_url ?? null} type="video" className="w-28 sm:w-32" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold">{p.title}</span>
                        {p.is_course && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[11px] font-semibold">
                            <BookOpen className="size-3" aria-hidden /> ซีรีส์บทเรียน
                          </span>
                        )}
                      </span>
                      <span className="t-meta tnum mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{formatNumber(p.content_ids.length)} ตอน</span>
                        {total > 0 && <span>· {formatDuration(total)}</span>}
                        {p.visibility === "members" ? (
                          <span className="inline-flex items-center gap-1 text-member">
                            · <Lock className="size-3" aria-hidden /> เฉพาะสมาชิก
                          </span>
                        ) : (
                          <span>· สาธารณะ</span>
                        )}
                      </span>
                    </span>
                  </button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ ...p })} aria-label={`แก้ไข ${p.title}`}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="text-danger" onClick={() => setToDelete(p)} aria-label={`ลบ ${p.title}`}>
                    <Trash />
                  </Button>
                </SortableItem>
              );
            }}
          </SortableList>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && close()}>
        {editing && (
          <SheetContent side="right" title={editing.id ? "แก้ไข Playlist" : "สร้าง Playlist"} className="max-w-xl">
            <PlaylistForm
              key={editing.id ?? "new"}
              draft={editing}
              items={items}
              byId={byId}
              onDone={() => {
                close();
                router.refresh();
              }}
            />
          </SheetContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`ลบ “${toDelete?.title ?? ""}”?`}
        body="คลิปใน Playlist จะไม่ถูกลบ แต่ลำดับตอนและความคืบหน้าของซีรีส์นี้จะหายไป"
        confirmLabel="ลบ Playlist"
        onConfirm={async () => {
          if (!toDelete) return;
          const p = toDelete;
          const r = await deletePlaylistAction(p.id);
          setToDelete(null);
          if (!r.ok) return void toast(r.error);
          setList((l) => l.filter((x) => x.id !== p.id));
          toast("ลบ Playlist แล้ว");
          router.refresh();
        }}
      />
    </div>
  );
}

function PlaylistForm({
  draft,
  items,
  byId,
  onDone,
}: {
  draft: Draft;
  items: PickItem[];
  byId: Map<string, PickItem>;
  onDone: () => void;
}) {
  const [f, setF] = React.useState<Draft>(draft);
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const imgRef = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const rows = f.content_ids.map((id) => ({ id, item: byId.get(id) }));

  const save = async () => {
    if (!f.title.trim()) return void toast("กรุณาใส่ชื่อ Playlist");
    setSaving(true);
    const r = await savePlaylistAction(f.id, {
      title: f.title,
      description: f.description,
      thumbnail_url: f.thumbnail_url,
      visibility: f.visibility,
      is_course: f.is_course,
      content_ids: f.content_ids,
    });
    setSaving(false);
    if (!r.ok) return void toast(r.error);
    toast(f.id ? "บันทึก Playlist แล้ว" : "สร้าง Playlist แล้ว");
    onDone();
  };

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-2">
        <Field label="ชื่อ" counter={`${f.title.length}/100`}>
          <input value={f.title} onChange={(e) => set("title", e.target.value.slice(0, 100))} className={inputClass} placeholder="เช่น เริ่มต้นขาย Digital Product ใน 30 วัน" autoFocus />
        </Field>
        <Field label="คำอธิบาย">
          <textarea value={f.description} onChange={(e) => set("description", e.target.value.slice(0, 5000))} rows={3} className={cn(inputClass, "resize-y")} />
        </Field>

        <div>
          <p className="mb-1.5 text-[13px] font-medium">ภาพปก</p>
          <div className="flex items-center gap-3">
            <div className="relative aspect-video w-36 overflow-hidden rounded-[10px] bg-elevated">
              {f.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <span className="t-caption absolute inset-0 flex items-center justify-center px-2 text-center text-text-2">ใช้ภาพปกของตอนแรก</span>
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <Button variant="outline" size="sm" onClick={() => imgRef.current?.click()}>
                <ImagePlus /> อัปโหลดภาพ
              </Button>
              {f.thumbnail_url && (
                <Button variant="ghost" size="sm" onClick={() => set("thumbnail_url", null)}>
                  นำออก
                </Button>
              )}
            </div>
            <input
              ref={imgRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                uploadImageFile(file, "playlists").then(
                  (url) => set("thumbnail_url", url),
                  (err) => toast(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ"),
                );
              }}
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium">การมองเห็น</p>
          <div className="inline-flex rounded-full border border-border p-1" role="radiogroup" aria-label="การมองเห็น">
            {(["public", "members"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={f.visibility === v}
                onClick={() => set("visibility", v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                  f.visibility === v ? "bg-text text-bg" : "text-text-2 hover:text-text",
                )}
              >
                {v === "members" && <Lock className={cn("size-3.5", f.visibility === v ? "" : "text-member")} aria-hidden />}
                {v === "public" ? "สาธารณะ" : "เฉพาะสมาชิก"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-[14px] border border-border px-4 py-3">
          <span>
            <span className="block text-[14px] font-medium">ซีรีส์บทเรียน</span>
            <span className="t-meta">แสดงแถบความคืบหน้าและลำดับตอนให้ผู้เรียน</span>
          </span>
          <Switch checked={f.is_course} onCheckedChange={(v) => set("is_course", v)} aria-label="ซีรีส์บทเรียน" />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium">
              ตอนใน Playlist <span className="tnum text-text-2">({rows.length})</span>
            </p>
            <Button variant={adding ? "secondary" : "outline"} size="sm" onClick={() => setAdding((a) => !a)}>
              {adding ? <X /> : <Plus />} {adding ? "ปิด" : "เพิ่มตอน"}
            </Button>
          </div>
          {adding && (
            <div className="mb-3 rounded-[14px] border border-border bg-surface p-3">
              <ContentPickerList items={items} selected={f.content_ids} onAdd={(id) => set("content_ids", [...f.content_ids, id])} autoFocus />
            </div>
          )}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center rounded-[14px] border border-dashed border-border px-4 py-8 text-center">
              <ListVideo className="size-6 text-text-2" strokeWidth={1.5} aria-hidden />
              <p className="t-meta mt-2">ยังไม่มีตอน กด “เพิ่มตอน” เพื่อเลือกคลิป</p>
            </div>
          ) : (
            <SortableList items={rows} getId={(r) => r.id} onReorder={(next) => set("content_ids", next.map((r) => r.id))} className="space-y-1" label="เรียงลำดับตอน">
              {(r, i) => (
                <SortableItem key={r.id} id={r.id} className="rounded-[12px] py-1 pr-1 hover:bg-hover" handleLabel={`ลากเพื่อย้ายตอนที่ ${i + 1}`}>
                  <span className="tnum w-5 text-center text-[13px] text-text-2">{i + 1}</span>
                  <StudioThumb src={r.item?.thumbnail_url ?? null} type={r.item?.type ?? "video"} duration={r.item?.duration_sec} className="w-20" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] leading-5">{r.item?.title ?? "คอนเทนต์ถูกลบแล้ว"}</span>
                    {r.item && <span className="t-caption text-text-2">{TYPE_LABEL[r.item.type]}{!r.item.live && " · ยังไม่เผยแพร่"}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => set("content_ids", f.content_ids.filter((x) => x !== r.id))}
                    className="rounded-full p-1.5 text-text-2 hover:bg-[var(--border-strong)] hover:text-text"
                    aria-label={`นำ ${r.item?.title ?? "ตอนนี้"} ออก`}
                  >
                    <X className="size-4" />
                  </button>
                </SortableItem>
              )}
            </SortableList>
          )}
        </div>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3 safe-bottom">
        <Button variant="inverse" onClick={save} disabled={saving}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </>
  );
}
