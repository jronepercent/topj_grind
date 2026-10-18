"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { saveHomeSectionsAction } from "@/app/studio/actions";
import { TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HomeSectionType } from "@/lib/types";
import type { PickItem } from "./types";
import { SortableItem, SortableList } from "./sortable";
import { ContentPickerDialog } from "./content-picker";
import { Card, CardHeader, StudioThumb } from "./ui";

export interface CurationSection {
  id: string;
  type: HomeSectionType;
  title: string;
  content_ids: string[];
  enabled: boolean;
}

const TYPE_DESC: Record<HomeSectionType, string> = {
  hero: "Hero",
  continue: "ดูต่อจากที่ค้างไว้ (เฉพาะผู้ที่เข้าสู่ระบบ)",
  latest: "คลิปใหม่ล่าสุดอัตโนมัติ",
  shorts: "บทความล่าสุดอัตโนมัติ",
  podcasts: "พอดแคสต์ล่าสุดอัตโนมัติ",
  playlists: "Playlist และซีรีส์ทั้งหมด",
  custom: "แถบที่เลือกคลิปเอง",
};

export function HomeCuration({ sections: initial, items }: { sections: CurationSection[]; items: PickItem[] }) {
  const router = useRouter();
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [sections, setSections] = React.useState<CurationSection[]>(initial);
  const [picker, setPicker] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const baseline = React.useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(sections) !== baseline.current;

  const patch = (id: string, p: Partial<CurationSection>) => setSections((xs) => xs.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const save = async () => {
    if (sections.some((s) => !s.title.trim())) return void toast("กรุณาตั้งชื่อทุกแถบ");
    setSaving(true);
    const payload = sections.map((s) => ({ ...s, title: s.title.trim(), id: s.id.startsWith("new-") ? "" : s.id }));
    const r = await saveHomeSectionsAction(payload);
    setSaving(false);
    if (!r.ok) return void toast(r.error);
    baseline.current = JSON.stringify(sections);
    toast("บันทึกหน้า Home แล้ว");
    router.refresh();
  };

  const addCustom = () => {
    const id = `new-${Math.random().toString(36).slice(2)}`;
    setSections((xs) => [...xs, { id, type: "custom", title: "แถบใหม่", content_ids: [], enabled: true }]);
    setOpen(id);
  };

  const pickerSection = picker ? sections.find((s) => s.id === picker) : null;

  return (
    <div className="pb-20">
      <Card>
        <CardHeader
          title="แถบบนหน้า Home"
          description="เปิด/ปิด เปลี่ยนชื่อ และลากเพื่อเรียงลำดับ"
          action={
            <Button variant="outline" size="sm" onClick={addCustom}>
              <Plus /> เพิ่มแถบ
            </Button>
          }
        />
        <div className="px-3 pb-4 pt-3">
          <SortableList items={sections} getId={(s) => s.id} onReorder={setSections} className="space-y-2" label="เรียงลำดับแถบ">
            {(s) => (
              <SortableItem key={s.id} id={s.id} className={cn("items-start rounded-[14px] border border-border bg-bg p-2", !s.enabled && "opacity-60")} handleLabel={`ลากเพื่อย้ายแถบ ${s.title}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      value={s.title}
                      onChange={(e) => patch(s.id, { title: e.target.value.slice(0, 60) })}
                      aria-label="ชื่อแถบ"
                      className={cn(inputClass, "h-9 max-w-xs flex-1 py-0 text-[14px] font-medium")}
                    />
                    <span className="t-caption min-w-0 flex-1 text-text-2">{TYPE_DESC[s.type]}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {s.type === "custom" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpen(open === s.id ? null : s.id)}
                            aria-expanded={open === s.id}
                          >
                            <span className="tnum">{s.content_ids.length} คลิป</span>
                            <ChevronDown className={cn("transition-transform", open === s.id && "rotate-180")} />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="text-danger" onClick={() => setSections((xs) => xs.filter((x) => x.id !== s.id))} aria-label={`ลบแถบ ${s.title}`}>
                            <Trash />
                          </Button>
                        </>
                      )}
                      <Switch checked={s.enabled} onCheckedChange={(v) => patch(s.id, { enabled: v })} aria-label={`แสดงแถบ ${s.title}`} />
                    </div>
                  </div>
                  {s.type === "custom" && open === s.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      <ItemList ids={s.content_ids} byId={byId} onChange={(ids) => patch(s.id, { content_ids: ids })} empty="ยังไม่มีคลิปในแถบนี้" />
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setPicker(s.id)}>
                        <Plus /> เพิ่มคลิป
                      </Button>
                    </div>
                  )}
                </div>
              </SortableItem>
            )}
          </SortableList>
        </div>
      </Card>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border transition-transform duration-300 ease-[var(--ease-apple)] glass",
          dirty ? "translate-y-0" : "translate-y-full",
        )}
        aria-hidden={!dirty}
      >
        <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3 px-4 py-3 safe-bottom sm:px-6 lg:pl-[272px]">
          <span className="t-meta mr-auto">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
          <Button
            variant="ghost"
            tabIndex={dirty ? 0 : -1}
            onClick={() => {
              setSections(JSON.parse(baseline.current) as CurationSection[]);
            }}
          >
            ยกเลิก
          </Button>
          <Button variant="inverse" onClick={save} disabled={saving} tabIndex={dirty ? 0 : -1}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </div>

      <ContentPickerDialog
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={`เพิ่มคลิปใน “${pickerSection?.title ?? ""}”`}
        hint="คลิปที่ยังไม่เผยแพร่จะขึ้นหน้าเว็บเมื่อเผยแพร่แล้ว"
        items={items}
        selected={pickerSection?.content_ids ?? []}
        onAdd={(id) => {
          if (pickerSection) patch(pickerSection.id, { content_ids: [...pickerSection.content_ids, id] });
        }}
      />
    </div>
  );
}

function ItemList({ ids, byId, onChange, empty }: { ids: string[]; byId: Map<string, PickItem>; onChange: (ids: string[]) => void; empty: string }) {
  if (!ids.length) return <p className="t-meta rounded-[12px] border border-dashed border-border px-4 py-6 text-center">{empty}</p>;
  const rows = ids.map((id) => ({ id, item: byId.get(id) }));
  return (
    <SortableList items={rows} getId={(r) => r.id} onReorder={(next) => onChange(next.map((r) => r.id))} className="space-y-1" label="เรียงลำดับคลิป">
      {(r, i) => (
        <SortableItem key={r.id} id={r.id} className="rounded-[12px] py-1 pr-1 hover:bg-hover" handleLabel={`ลากเพื่อย้ายคลิปที่ ${i + 1}`}>
          <span className="tnum w-5 text-center text-[13px] text-text-2">{i + 1}</span>
          <StudioThumb src={r.item?.thumbnail_url ?? null} type={r.item?.type ?? "video"} className="w-24" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[14px] leading-5">{r.item?.title ?? "คอนเทนต์ถูกลบแล้ว"}</span>
            {r.item && (
              <span className="t-caption text-text-2">
                {TYPE_LABEL[r.item.type]}
                {!r.item.live && " · ยังไม่เผยแพร่ (จะไม่แสดงจนกว่าจะเผยแพร่)"}
              </span>
            )}
          </span>
          <button type="button" onClick={() => onChange(ids.filter((x) => x !== r.id))} className="rounded-full p-1.5 text-text-2 hover:bg-[var(--border-strong)] hover:text-text" aria-label={`นำ ${r.item?.title ?? "คลิปนี้"} ออก`}>
            <X className="size-4" />
          </button>
        </SortableItem>
      )}
    </SortableList>
  );
}
