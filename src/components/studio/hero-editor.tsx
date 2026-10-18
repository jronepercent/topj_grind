"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Film, ImagePlus, Link2, Monitor, Plus, Smartphone, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Hero } from "@/components/content/hero";
import { saveHeroAction, type HeroSlideInput } from "@/app/studio/actions";
import { HERO_LIMITS, HERO_MAX_SLIDES, heroSlideState, isHeroHref, resolveHeroSlide, type HeroContent, type HeroSlideState } from "@/lib/hero";
import { thaiDateTime, TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HeroSlideRow } from "@/lib/types";
import type { PickItem } from "./types";
import { SortableItem, SortableList } from "./sortable";
import { ContentPickerDialog } from "./content-picker";
import { uploadImageFile } from "./editor-parts";
import { Card, CardHeader, Dot, StudioThumb } from "./ui";

type Slide = HeroSlideInput;

const STATE: Record<HeroSlideState, { label: string; tone: "success" | "danger" | "muted" | "member" }> = {
  on: { label: "กำลังแสดง", tone: "success" },
  off: { label: "ปิดอยู่", tone: "muted" },
  scheduled: { label: "ตั้งเวลาไว้", tone: "member" },
  ended: { label: "หมดเวลาแล้ว", tone: "muted" },
  unpublished: { label: "คลิปยังไม่เผยแพร่", tone: "danger" },
  incomplete: { label: "ข้อมูลไม่ครบ", tone: "danger" },
};

const LINK_PRESETS = [
  { href: "/membership", label: "หน้าสมัครสมาชิก" },
  { href: "/playlists", label: "หน้า Playlist" },
  { href: "/community", label: "หน้าชุมชน" },
  { href: "/community/articles", label: "หน้าบทความ" },
  { href: "/podcasts", label: "หน้าพอดแคสต์" },
];

const newId = () => `new-${Math.random().toString(36).slice(2)}`;
const blank = (content_id: string | null): Slide => ({
  id: newId(),
  enabled: true,
  content_id,
  title: "",
  subtitle: "",
  image_url: null,
  mobile_image_url: null,
  cta_label: "",
  cta_href: "",
  starts_at: null,
  ends_at: null,
});

/** ISO ↔ <input type="datetime-local"> in the admin's own time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function HeroEditor({
  enabled: initialEnabled,
  slides: initialSlides,
  items,
  descriptions,
}: {
  enabled: boolean;
  slides: HeroSlideRow[];
  items: PickItem[];
  /** First line of each clip's description (the default subtitle). */
  descriptions: Record<string, string>;
}) {
  const router = useRouter();
  const init = React.useMemo(
    () => ({ enabled: initialEnabled, slides: initialSlides.map(({ position: _p, ...s }) => s as Slide) }),
    [initialEnabled, initialSlides],
  );
  const [enabled, setEnabled] = React.useState(init.enabled);
  const [slides, setSlides] = React.useState<Slide[]>(init.slides);
  const [open, setOpen] = React.useState<string | null>(null);
  const [picker, setPicker] = React.useState<null | { mode: "new" } | { mode: "change"; id: string }>(null);
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = React.useState(false);
  const baseline = React.useRef(JSON.stringify(init));
  const dirty = JSON.stringify({ enabled, slides }) !== baseline.current;

  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const clipOf = React.useCallback(
    (id: string | null): HeroContent | null => {
      const it = id ? byId.get(id) : null;
      return it
        ? { id: it.id, type: it.type, title: it.title, description: descriptions[it.id] ?? "", thumbnail_url: it.thumbnail_url, duration_sec: it.duration_sec, visibility: it.visibility }
        : null;
    },
    [byId, descriptions],
  );
  const asRow = (s: Slide, i: number): HeroSlideRow => ({ ...s, position: i });
  const stateOf = (s: Slide, i: number) => heroSlideState(asRow(s, i), clipOf(s.content_id), !!(s.content_id && byId.get(s.content_id)?.live));

  const patch = (id: string, p: Partial<Slide>) => setSlides((xs) => xs.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const full = slides.length >= HERO_MAX_SLIDES;

  // Preview: the slide being edited (even if scheduled or switched off), otherwise what's on the site now.
  const openIdx = slides.findIndex((s) => s.id === open);
  const previewRows = openIdx >= 0 ? [slides[openIdx]] : enabled ? slides.filter((s, i) => stateOf(s, i) === "on") : [];
  const preview = previewRows
    .map((s) => resolveHeroSlide(asRow(s, 0), clipOf(s.content_id)))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const check = (): string | null => {
    for (const [i, s] of slides.entries()) {
      const n = `สไลด์ ${i + 1}`;
      if (!isHeroHref(s.cta_href.trim())) return `${n}: ลิงก์ปุ่มต้องขึ้นต้นด้วย / หรือ https://`;
      if (!s.content_id && (!s.title.trim() || !s.cta_href.trim() || !(s.image_url || s.mobile_image_url)))
        return `${n}: แบนเนอร์ที่ไม่ผูกคลิปต้องมีรูป หัวข้อ และลิงก์ปุ่ม`;
      if (s.starts_at && s.ends_at && s.ends_at <= s.starts_at) return `${n}: เวลาสิ้นสุดต้องหลังเวลาเริ่ม`;
    }
    return null;
  };

  const save = async () => {
    const err = check();
    if (err) return void toast(err);
    setSaving(true);
    const r = await saveHeroAction(enabled, slides);
    setSaving(false);
    if (!r.ok) return void toast(r.error);
    baseline.current = JSON.stringify({ enabled, slides });
    toast("บันทึก Hero แล้ว · หน้าเว็บจะอัปเดตภายในไม่กี่วินาที");
    router.refresh();
  };

  const addBanner = () => {
    const s = blank(null);
    setSlides((xs) => [...xs, s]);
    setOpen(s.id);
  };

  return (
    <Card>
      <CardHeader
        title="Hero"
        description={`สไลด์ใหญ่บนสุดของหน้าแรก สูงสุด ${HERO_MAX_SLIDES} สไลด์ ลากเพื่อเรียงลำดับ`}
        action={
          <label className="flex shrink-0 items-center gap-2 text-[13px] font-medium">
            แสดง Hero
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="แสดง Hero บนหน้าแรก" />
          </label>
        }
      />

      {/* Preview */}
      <div className="px-5 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="t-meta mr-auto">
            {openIdx >= 0 ? `ตัวอย่างสไลด์ ${openIdx + 1}` : "ตัวอย่างสิ่งที่แสดงบนหน้าแรกตอนนี้"}
          </span>
          <div className="flex rounded-full bg-hover p-0.5" role="radiogroup" aria-label="ขนาดจอตัวอย่าง">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={device === d}
                onClick={() => setDevice(d)}
                className={cn("flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium", device === d ? "bg-surface shadow-sm" : "text-text-2")}
              >
                {d === "desktop" ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />}
                {d === "desktop" ? "คอม" : "มือถือ"}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("overflow-hidden rounded-[12px] border border-border bg-black", device === "mobile" && "mx-auto w-[375px] max-w-full")}>
          {preview.length ? (
            <Hero key={device + preview.map((p) => p.id).join()} items={preview} device={device} className={device === "mobile" ? "h-[480px]" : "h-[400px]"} />
          ) : (
            <p className={cn("flex items-center justify-center px-6 text-center text-[14px] text-white/60", device === "mobile" ? "h-[480px]" : "h-[220px]")}>
              {!enabled
                ? "Hero ปิดอยู่ หน้าแรกจะเริ่มที่แถบคลิปเลย"
                : openIdx >= 0
                  ? "สไลด์นี้ยังไม่ครบ ใส่รูป หัวข้อ และลิงก์ปุ่ม หรือผูกคลิป"
                  : "ยังไม่มีสไลด์ที่แสดงตอนนี้ กดเพิ่มสไลด์ด้านล่าง"}
            </p>
          )}
        </div>
      </div>

      {/* Slides */}
      <div className="px-3 pb-4 pt-4">
        {slides.length ? (
          <SortableList items={slides} getId={(s) => s.id} onReorder={setSlides} className="space-y-2" label="เรียงลำดับสไลด์">
            {(s, i) => {
              const clip = clipOf(s.content_id);
              const st = STATE[stateOf(s, i)];
              const thumb = s.image_url || clip?.thumbnail_url || s.mobile_image_url || null;
              const isOpen = open === s.id;
              return (
                <SortableItem key={s.id} id={s.id} className={cn("items-start rounded-[14px] border border-border bg-bg p-2", !s.enabled && "opacity-70")} handleLabel={`ลากเพื่อย้ายสไลด์ ${i + 1}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}>
                        <StudioThumb src={thumb} type={clip?.type ?? "video"} className="w-24" />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-[14px] font-medium leading-5">{s.title.trim() || clip?.title || "(ยังไม่ได้ใส่หัวข้อ)"}</span>
                          <span className="t-caption mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-text-2">
                            <span className="inline-flex items-center gap-1.5">
                              <Dot tone={st.tone} /> {st.label}
                              {stateOf(s, i) === "scheduled" && s.starts_at && ` · เริ่ม ${thaiDateTime(s.starts_at)}`}
                            </span>
                            <span>{clip ? `${TYPE_LABEL[clip.type]} ที่ผูกไว้` : "แบนเนอร์"}</span>
                            {s.ends_at && stateOf(s, i) === "on" && <span>ถึง {thaiDateTime(s.ends_at)}</span>}
                          </span>
                        </span>
                        <ChevronDown className={cn("size-4 shrink-0 text-text-2 transition-transform", isOpen && "rotate-180")} />
                      </button>
                      <Switch checked={s.enabled} onCheckedChange={(v) => patch(s.id, { enabled: v })} aria-label={`แสดงสไลด์ ${i + 1}`} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-danger"
                        onClick={() => {
                          setSlides((xs) => xs.filter((x) => x.id !== s.id));
                          if (isOpen) setOpen(null);
                        }}
                        aria-label={`ลบสไลด์ ${i + 1}`}
                      >
                        <Trash />
                      </Button>
                    </div>
                    {isOpen && (
                      <SlideForm
                        slide={s}
                        clip={clip}
                        clipLive={!!(s.content_id && byId.get(s.content_id)?.live)}
                        onChange={(p) => patch(s.id, p)}
                        onPickClip={() => setPicker({ mode: "change", id: s.id })}
                      />
                    )}
                  </div>
                </SortableItem>
              );
            }}
          </SortableList>
        ) : (
          <p className="t-meta rounded-[12px] border border-dashed border-border px-4 py-6 text-center">ยังไม่มีสไลด์ใน Hero</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
          <Button variant="outline" size="sm" disabled={full} onClick={() => setPicker({ mode: "new" })}>
            <Film /> เพิ่มสไลด์จากคลิป
          </Button>
          <Button variant="outline" size="sm" disabled={full} onClick={addBanner}>
            <ImagePlus /> เพิ่มแบนเนอร์
          </Button>
          <span className="t-caption tnum text-text-2">
            {slides.length}/{HERO_MAX_SLIDES}
          </span>
          {dirty && (
            <div className="ml-auto flex items-center gap-2">
              <span className="t-caption text-text-2">ยังไม่ได้บันทึก</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const b = JSON.parse(baseline.current) as typeof init;
                  setEnabled(b.enabled);
                  setSlides(b.slides);
                  setOpen(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button variant="inverse" size="sm" onClick={save} disabled={saving}>
                {saving ? "กำลังบันทึก…" : "บันทึก Hero"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ContentPickerDialog
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        title={picker?.mode === "change" ? "เลือกคลิปที่จะผูกกับสไลด์" : "เพิ่มสไลด์จากคลิป"}
        hint="คลิปที่ยังไม่เผยแพร่จะขึ้นใน Hero เมื่อเผยแพร่แล้ว"
        items={items}
        selected={picker?.mode === "change" ? [slides.find((s) => s.id === picker.id)?.content_id ?? ""] : []}
        disabled={picker?.mode === "new" && full}
        onAdd={(id) => {
          if (picker?.mode === "change") patch(picker.id, { content_id: id });
          else {
            const s = blank(id);
            setSlides((xs) => (xs.length >= HERO_MAX_SLIDES ? xs : [...xs, s]));
          }
          setPicker(null);
        }}
      />
    </Card>
  );
}

function SlideForm({
  slide: s,
  clip,
  clipLive,
  onChange,
  onPickClip,
}: {
  slide: Slide;
  clip: HeroContent | null;
  clipLive: boolean;
  onChange: (p: Partial<Slide>) => void;
  onPickClip: () => void;
}) {
  const preset = LINK_PRESETS.find((p) => p.href === s.cta_href);
  const [custom, setCustom] = React.useState(!!s.cta_href && !preset);
  const mode = custom || (!clip && !preset) ? "custom" : preset ? preset.href : "clip";

  return (
    <div className="mt-3 space-y-4 border-t border-border px-1 pb-1 pt-4">
      {/* Linked clip */}
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">คลิปที่ผูกไว้</span>
        {clip ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-border p-2">
            <StudioThumb src={clip.thumbnail_url} type={clip.type} className="w-20" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-[14px]">{clip.title}</span>
              <span className="t-caption text-text-2">
                {TYPE_LABEL[clip.type]}
                {!clipLive && " · ยังไม่เผยแพร่ สไลด์จะซ่อนจนกว่าคลิปจะเผยแพร่"}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={onPickClip}>
              เปลี่ยน
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onChange({ content_id: null })} aria-label="เลิกผูกคลิป">
              <X />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPickClip}>
              <Link2 /> ผูกคลิป
            </Button>
            <span className="t-caption text-text-2">ไม่ผูกคลิปก็ได้ ใช้เป็นแบนเนอร์โปรโมชันที่มีรูปและลิงก์ของตัวเอง</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="หัวข้อ" counter={`${s.title.length}/${HERO_LIMITS.title}`} hint={clip ? "เว้นว่างไว้เพื่อใช้ชื่อคลิป" : undefined}>
          <input
            value={s.title}
            maxLength={HERO_LIMITS.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={clip?.title ?? "เช่น เปิดรับสมาชิกรอบใหม่"}
            className={inputClass}
          />
        </Field>
        <Field label="ข้อความปุ่ม" counter={`${s.cta_label.length}/${HERO_LIMITS.cta_label}`} hint="เว้นว่างไว้จะใช้คำว่า “ดูเลย”">
          <input value={s.cta_label} maxLength={HERO_LIMITS.cta_label} onChange={(e) => onChange({ cta_label: e.target.value })} placeholder="ดูเลย" className={inputClass} />
        </Field>
      </div>

      <Field label="คำโปรย" counter={`${s.subtitle.length}/${HERO_LIMITS.subtitle}`} hint={clip ? "เว้นว่างไว้เพื่อใช้บรรทัดแรกของคำอธิบายคลิป" : undefined}>
        <textarea
          value={s.subtitle}
          maxLength={HERO_LIMITS.subtitle}
          rows={2}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          placeholder={(clip && clip.description.split("\n")[0]) || "ข้อความสั้น ๆ ใต้หัวข้อ"}
          className={cn(inputClass, "resize-none")}
        />
      </Field>

      {/* Button link */}
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">ปุ่มพาไปที่</span>
        <div className="flex flex-wrap gap-1.5">
          {clip && (
            <Chip active={mode === "clip"} onClick={() => (setCustom(false), onChange({ cta_href: "" }))}>
              คลิปที่ผูกไว้
            </Chip>
          )}
          {LINK_PRESETS.map((p) => (
            <Chip key={p.href} active={mode === p.href} onClick={() => (setCustom(false), onChange({ cta_href: p.href }))}>
              {p.label}
            </Chip>
          ))}
          <Chip
            active={mode === "custom"}
            onClick={() => {
              setCustom(true);
              if (preset) onChange({ cta_href: "" });
            }}
          >
            ลิงก์อื่น
          </Chip>
        </div>
        {mode === "custom" && (
          <input
            value={s.cta_href}
            maxLength={HERO_LIMITS.cta_href}
            onChange={(e) => onChange({ cta_href: e.target.value.trim() })}
            placeholder="https://lin.ee/… หรือ /watch/…"
            aria-label="ลิงก์ปุ่ม"
            className={cn(inputClass, "mt-2", s.cta_href && !isHeroHref(s.cta_href) && "border-danger")}
          />
        )}
        {mode === "custom" && s.cta_href && !isHeroHref(s.cta_href) && <p className="t-caption mt-1 text-danger">ลิงก์ต้องขึ้นต้นด้วย / หรือ https://</p>}
      </div>

      {/* Images */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField
          label="รูปบนคอม"
          hint="แนวนอน 16:9 แนะนำ 1920×1080"
          ratio="aspect-video"
          value={s.image_url}
          fallback={clip?.thumbnail_url ?? null}
          fallbackNote="ใช้ปกคลิป"
          onChange={(v) => onChange({ image_url: v })}
        />
        <ImageField
          label="รูปบนมือถือ (ไม่ใส่ก็ได้)"
          hint="แนวตั้ง 4:5 แนะนำ 1080×1350 ถ้าไม่ใส่จะใช้รูปบนคอม"
          ratio="aspect-[4/5] max-w-[220px]"
          value={s.mobile_image_url}
          fallback={s.image_url ?? clip?.thumbnail_url ?? null}
          fallbackNote="ใช้รูปบนคอม"
          onChange={(v) => onChange({ mobile_image_url: v })}
        />
      </div>

      {/* Schedule */}
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">ช่วงเวลาที่แสดง</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="t-caption mb-1 block text-text-2">เริ่ม (เว้นว่าง = แสดงทันที)</span>
            <input type="datetime-local" value={toLocalInput(s.starts_at)} onChange={(e) => onChange({ starts_at: fromLocalInput(e.target.value) })} className={inputClass} />
          </label>
          <label className="block">
            <span className="t-caption mb-1 block text-text-2">สิ้นสุด (เว้นว่าง = ไม่มีกำหนด)</span>
            <input type="datetime-local" value={toLocalInput(s.ends_at)} onChange={(e) => onChange({ ends_at: fromLocalInput(e.target.value) })} className={inputClass} />
          </label>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("h-8 rounded-full px-3 text-[13px] font-medium transition-colors", active ? "bg-text text-bg" : "bg-hover text-text hover:bg-[var(--border-strong)]")}
    >
      {children}
    </button>
  );
}

function ImageField({
  label,
  hint,
  ratio,
  value,
  fallback,
  fallbackNote,
  onChange,
}: {
  label: string;
  hint: string;
  ratio: string;
  value: string | null;
  fallback: string | null;
  fallbackNote: string;
  onChange: (v: string | null) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const shown = value ?? fallback;
  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      <div className={cn("relative w-full overflow-hidden rounded-[12px] border border-border bg-elevated", ratio)}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className={cn("absolute inset-0 size-full object-cover", !value && "opacity-50")} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-text-2">
            <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        {!value && shown && <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">{fallbackNote}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
          <ImagePlus /> {value ? "เปลี่ยนรูป" : "อัปโหลด"}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            เอารูปออก
          </Button>
        )}
      </div>
      <span className="t-caption mt-1 block text-text-2">{hint}</span>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          uploadImageFile(f, "hero").then(onChange, (err) => toast(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ"));
        }}
      />
    </div>
  );
}
