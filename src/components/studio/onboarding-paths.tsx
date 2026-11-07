"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveOnboardingPathsAction } from "@/app/studio/home/onboarding-actions";
import { TYPE_LABEL } from "@/lib/format";
import { STAGES, type OnboardingStage } from "@/lib/onboarding";
import type { PickItem } from "./types";
import { SortableItem, SortableList } from "./sortable";
import { ContentPickerDialog } from "./content-picker";
import { Card, CardHeader, StudioThumb } from "./ui";

type Paths = Record<OnboardingStage, string[]>;
const MAX = 10;

export function OnboardingPaths({ paths: initial, items }: { paths: Paths; items: PickItem[] }) {
  const router = useRouter();
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [paths, setPaths] = React.useState<Paths>(initial);
  const [picker, setPicker] = React.useState<OnboardingStage | null>(null);
  const [saving, setSaving] = React.useState(false);
  const baseline = React.useRef(JSON.stringify(initial));
  const dirty = JSON.stringify(paths) !== baseline.current;

  const set = (stage: OnboardingStage, ids: string[]) => setPaths((p) => ({ ...p, [stage]: ids }));

  const save = async () => {
    setSaving(true);
    const r = await saveOnboardingPathsAction(paths);
    setSaving(false);
    if (!r.ok) return void toast(r.error);
    baseline.current = JSON.stringify(paths);
    toast("บันทึกเส้นทางเริ่มต้นแล้ว");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader
        title="เส้นทางเริ่มต้น (หลังสมัคร)"
        description="คนสมัครใหม่ตอบ 1 ข้อ แล้วเจอคลิปตามลำดับที่นี่ (ไม่เกิน 10 คลิปต่อเส้นทาง) คลิปแรกควรเป็นคลิปที่ดูฟรีได้ (ไม่ใช่เฉพาะสมาชิก)"
        action={
          <Button variant="inverse" size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกเส้นทาง"}
          </Button>
        }
      />
      <div className="grid gap-4 px-3 pb-4 pt-3 lg:grid-cols-3">
        {STAGES.map((s) => {
          const ids = paths[s.key];
          const first = byId.get(ids[0]);
          return (
            <div key={s.key} className="min-w-0 rounded-[14px] border border-border bg-bg p-3">
              <h3 className="text-[14px] font-semibold leading-5">{s.pathTitle}</h3>
              <p className="t-caption mt-0.5 text-text-2">{s.label}</p>
              {first?.visibility === "members" && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-member/15 px-2.5 py-1 text-[12px] font-medium text-member">
                  <TriangleAlert className="size-3.5" aria-hidden /> คลิปแรกเป็นของสมาชิก คนสมัครใหม่จะดูไม่ได้
                </p>
              )}
              <div className="mt-3">
                {ids.length === 0 ? (
                  <p className="t-meta rounded-[12px] border border-dashed border-border px-3 py-5 text-center">ยังไม่มีคลิปในเส้นทางนี้</p>
                ) : (
                  <SortableList items={ids.map((id) => ({ id }))} getId={(r) => r.id} onReorder={(next) => set(s.key, next.map((r) => r.id))} className="space-y-1" label={`เรียงลำดับคลิป ${s.pathTitle}`}>
                    {(r, i) => {
                      const it = byId.get(r.id);
                      return (
                        <SortableItem key={r.id} id={r.id} className="rounded-[12px] py-1 pr-1 hover:bg-hover" handleLabel={`ลากเพื่อย้ายคลิปที่ ${i + 1}`}>
                          <span className="tnum w-4 text-center text-[12px] text-text-2">{i + 1}</span>
                          <StudioThumb src={it?.thumbnail_url ?? null} type={it?.type ?? "video"} className="w-16" />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-[13px] leading-[18px]">{it?.title ?? "คอนเทนต์ถูกลบแล้ว"}</span>
                            {it && (
                              <span className="t-caption text-text-2">
                                {TYPE_LABEL[it.type]}
                                {it.visibility === "members" && " · สมาชิก"}
                                {!it.live && " · ยังไม่เผยแพร่"}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => set(s.key, ids.filter((x) => x !== r.id))}
                            className="rounded-full p-1.5 text-text-2 hover:bg-[var(--border-strong)] hover:text-text"
                            aria-label={`นำ ${it?.title ?? "คลิปนี้"} ออก`}
                          >
                            <X className="size-4" />
                          </button>
                        </SortableItem>
                      );
                    }}
                  </SortableList>
                )}
              </div>
              <Button variant="outline" size="sm" className="mt-3" disabled={ids.length >= MAX} onClick={() => setPicker(s.key)}>
                <Plus /> เพิ่มคลิป
              </Button>
            </div>
          );
        })}
      </div>

      <ContentPickerDialog
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={`เพิ่มคลิปใน “${STAGES.find((s) => s.key === picker)?.pathTitle ?? ""}”`}
        hint="คลิปแรกควรเป็นคลิปที่ดูฟรีได้ (ไม่ใช่เฉพาะสมาชิก)"
        items={items}
        selected={picker ? paths[picker] : []}
        onAdd={(id) => {
          if (picker && paths[picker].length < MAX) set(picker, [...paths[picker], id]);
        }}
      />
    </Card>
  );
}
