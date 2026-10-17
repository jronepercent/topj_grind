"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Captions,
  Check,
  ChevronLeft,
  Clapperboard,
  FileText,
  Globe,
  ImagePlus,
  Lock,
  Paperclip,
  Plus,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { saveContentAction, type ContentInput } from "@/app/studio/actions";
import { contentHref, formatBytes, thaiDateTime, TYPE_LABEL } from "@/lib/format";
import { isValidUrl } from "@/lib/richtext";
import { cn } from "@/lib/utils";
import type { ContentType, Visibility } from "@/lib/types";
import type { EditorData, EditorOptions } from "./types";
import { SortableItem, SortableList } from "./sortable";
import { selectStyle } from "./ui";
import { useUploads } from "./upload-store";
import {
  bkkClock,
  bkkInputToIso,
  CardPreview,
  captureFrames,
  ChaptersPreview,
  DescriptionPreview,
  imageSize,
  isoToBkkInput,
  MediaStrip,
  mmssToSec,
  readAsDataUrl,
  secToMmss,
  TagInput,
  useMediaPhase,
} from "./editor-parts";

type LinkRow = { key: string; label: string; url: string };
type Resource = { id?: string; file_name: string; size_bytes: number };

interface Form {
  type: ContentType;
  title: string;
  description: string;
  thumbnail_url: string | null;
  category_id: string | null;
  tags: string[];
  visibility: Visibility;
  comments_enabled: boolean;
  linked_content_id: string | null;
  linked_start: string;
  captions_vtt: string | null;
  links: LinkRow[];
  resources: Resource[];
  playlist_ids: string[];
}

type PubMode = "draft" | "publish" | "schedule";
type SaveState = "idle" | "saving" | "saved" | "error";

const STEPS = ["รายละเอียด", "ตั้งค่า", "การมองเห็น"] as const;
const COVER_SIZE: Record<ContentType, string> = { video: "1280×720", short: "1080×1920", podcast: "3000×3000" };
const COVER_RATIO: Record<ContentType, number> = { video: 16 / 9, short: 9 / 16, podcast: 1 };
const key = () => Math.random().toString(36).slice(2);

function fromData(d: EditorData): Form {
  return {
    type: d.type,
    title: d.title,
    description: d.description,
    thumbnail_url: d.thumbnail_url,
    category_id: d.category_id,
    tags: d.tags,
    visibility: d.visibility,
    comments_enabled: d.comments_enabled,
    linked_content_id: d.linked_content_id,
    linked_start: secToMmss(d.linked_start_sec),
    captions_vtt: d.captions_vtt,
    links: d.links.map((l) => ({ ...l, key: key() })),
    resources: d.resources,
    playlist_ids: d.playlist_ids,
  };
}

/**
 * Form → server input. Lenient mode (autosave) silently drops fields that are not valid yet,
 * so a half-typed URL never blocks saving everything else.
 */
function buildInput(f: Form) {
  const errors: { step: number; msg: string }[] = [];
  const input: ContentInput = {
    type: f.type,
    description: f.description,
    thumbnail_url: f.thumbnail_url,
    category_id: f.category_id,
    tags: f.tags,
    visibility: f.visibility,
    comments_enabled: f.comments_enabled,
    captions_vtt: f.captions_vtt,
    resources: f.resources,
    playlist_ids: f.playlist_ids,
    linked_content_id: f.type === "short" ? f.linked_content_id : null,
  };
  const t = f.title.trim();
  if (!t) errors.push({ step: 0, msg: "กรุณาใส่ชื่อ" });
  else if (t.length > 100) errors.push({ step: 0, msg: "ชื่อยาวเกิน 100 ตัวอักษร" });
  else input.title = t;
  if (f.description.length > 5000) {
    errors.push({ step: 0, msg: "คำอธิบายยาวเกิน 5,000 ตัวอักษร" });
    delete input.description;
  }
  const links = f.links.filter((l) => l.label.trim() || l.url.trim());
  const badLink = links.find((l) => !isValidUrl(l.url.trim()) || !l.label.trim());
  if (badLink) errors.push({ step: 0, msg: !badLink.label.trim() ? "กรุณาใส่ชื่อปุ่มของลิงก์" : `ลิงก์ไม่ถูกต้อง: ${badLink.url || "(ว่าง)"}` });
  else input.links = links.map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
  const start = mmssToSec(f.linked_start);
  if (start === undefined) errors.push({ step: 0, msg: "เวลาเริ่มของคลิปเต็มต้องอยู่ในรูปแบบ นาที:วินาที" });
  else input.linked_start_sec = f.type === "short" && f.linked_content_id ? start : null;
  return { input, errors };
}

function snapshot(input: ContentInput) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) out[k] = JSON.stringify(v ?? null);
  return out;
}

function diff(input: ContentInput, saved: Record<string, string>): ContentInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (JSON.stringify(v ?? null) !== saved[k]) out[k] = v;
  return out as ContentInput;
}

export function ContentEditor({ data, options }: { data: EditorData; options: EditorOptions }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Form>(() => fromData(data));
  const [step, setStep] = React.useState(0);
  const [pubMode, setPubMode] = React.useState<PubMode>(
    data.status === "published" || data.publish_when_ready ? "publish" : data.status === "scheduled" ? "schedule" : "draft",
  );
  const [scheduleAt, setScheduleAt] = React.useState(isoToBkkInput(data.scheduled_at));
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [savedAt, setSavedAt] = React.useState<string>(data.updated_at);
  const [submitting, setSubmitting] = React.useState(false);

  const savedRef = React.useRef<Record<string, string>>(snapshot(buildInput(fromData(data)).input));
  const formRef = React.useRef(form);
  formRef.current = form;
  const savingRef = React.useRef(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pending = diff(buildInput(form).input, savedRef.current);
  const dirty = Object.keys(pending).length > 0;

  // ───── Autosave every 5s when dirty (as draft — never touches publish status) ─────
  const autosave = React.useCallback(async () => {
    if (savingRef.current) return;
    const changes = diff(buildInput(formRef.current).input, savedRef.current);
    if (!Object.keys(changes).length) return;
    savingRef.current = true;
    setSaveState("saving");
    const r = await saveContentAction(data.id, changes).catch(() => null);
    savingRef.current = false;
    if (r?.ok) {
      savedRef.current = { ...savedRef.current, ...snapshot(changes) };
      setSavedAt(r.data.updated_at);
      setSaveState("saved");
    } else setSaveState("error");
  }, [data.id]);

  React.useEffect(() => {
    const t = setInterval(() => void autosave(), 5000);
    return () => {
      clearInterval(t);
      // Leaving the page (client navigation): flush whatever is left.
      const changes = diff(buildInput(formRef.current).input, savedRef.current);
      if (Object.keys(changes).length) void saveContentAction(data.id, changes);
    };
  }, [autosave, data.id]);

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ───── Final save ─────
  const media = useMediaPhase(data.id, data.media_status);
  const submit = async () => {
    const { input, errors } = buildInput(form);
    if (errors.length) {
      setStep(errors[0].step);
      toast(errors[0].msg);
      return;
    }
    let scheduled_at: string | null = null;
    if (pubMode === "schedule") {
      if (!scheduleAt) {
        toast("กรุณาเลือกวันและเวลาเผยแพร่");
        return;
      }
      scheduled_at = bkkInputToIso(scheduleAt);
      if (new Date(scheduled_at).getTime() < Date.now()) {
        toast("เวลาที่ตั้งต้องอยู่ในอนาคต");
        return;
      }
    }
    setSubmitting(true);
    const status = pubMode === "draft" ? "draft" : pubMode === "publish" ? "published" : "scheduled";
    const r = await saveContentAction(data.id, { ...diff(input, savedRef.current), status, scheduled_at });
    setSubmitting(false);
    if (!r.ok) {
      toast(r.error);
      return;
    }
    savedRef.current = snapshot(input);
    setSavedAt(r.data.updated_at);
    if (status === "draft") toast("บันทึกฉบับร่างแล้ว");
    else if (status === "scheduled") toast(`ตั้งเวลาเผยแพร่ ${thaiDateTime(scheduled_at)}`);
    else if (r.data.status === "published") toast("เผยแพร่แล้ว");
    else toast("บันทึกแล้ว · จะเผยแพร่อัตโนมัติเมื่อประมวลผลเสร็จ");
    router.push("/studio/content");
    router.refresh();
  };

  const titleLen = form.title.length;
  const isNewDraft = data.status === "draft" && !data.publish_when_ready;

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/studio/content" className="inline-flex items-center gap-1 rounded-full py-1 pr-2 text-[14px] text-text-2 hover:text-text">
          <ChevronLeft className="size-4" /> คอนเทนต์
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <AutosaveIndicator state={saveState} dirty={dirty} savedAt={savedAt} draft={isNewDraft} />
          <Button asChild variant="ghost" size="sm">
            <a href={contentHref({ id: data.id, type: form.type })} target="_blank" rel="noopener noreferrer">
              ดูบนเว็บ <ArrowUpRight />
            </a>
          </Button>
        </div>
      </div>

      <MediaStrip id={data.id} initial={data.media_status} type={form.type} />

      <div className="mt-5 overflow-hidden rounded-[20px] border border-border bg-surface">
        {/* Stepper */}
        <nav aria-label="ขั้นตอน" className="border-b border-border px-3 sm:px-6">
          <ol className="flex">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={step === i ? "step" : undefined}
                  className={cn(
                    "relative flex w-full items-center justify-center gap-2 py-4 text-[14px] font-medium transition-colors sm:justify-start",
                    step === i ? "text-text" : "text-text-2 hover:text-text",
                    "after:absolute after:inset-x-2 after:bottom-[-1px] after:h-[2px] after:rounded-full",
                    step === i ? "after:bg-text" : "after:bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "tnum flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                      step === i ? "bg-text text-bg" : step > i ? "bg-hover text-text" : "border border-border text-text-2",
                    )}
                    aria-hidden
                  >
                    {step > i ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn(step !== i && "hidden sm:inline")}>{s}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="px-4 py-6 sm:px-6">
          {step === 0 && (
            <StepDetails
              form={form}
              set={set}
              options={options}
              data={data}
              titleLen={titleLen}
            />
          )}
          {step === 1 && <StepSettings form={form} set={set} />}
          {step === 2 && (
            <StepVisibility
              form={form}
              set={set}
              pubMode={pubMode}
              setPubMode={setPubMode}
              scheduleAt={scheduleAt}
              setScheduleAt={setScheduleAt}
              mediaReady={media.phase === "ready"}
            />
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              ย้อนกลับ
            </Button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-2">
            {step < 2 && (
              <Button variant="secondary" onClick={() => setStep(step + 1)}>
                ถัดไป
              </Button>
            )}
            <Button variant={step === 2 ? "primary" : "inverse"} onClick={submit} disabled={submitting}>
              {submitting ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AutosaveIndicator({ state, dirty, savedAt, draft }: { state: SaveState; dirty: boolean; savedAt: string; draft: boolean }) {
  const text =
    state === "saving"
      ? "กำลังบันทึก…"
      : state === "error"
        ? "บันทึกอัตโนมัติไม่สำเร็จ · จะลองใหม่"
        : dirty
          ? "มีการแก้ไขที่ยังไม่บันทึก"
          : `${draft ? "บันทึกฉบับร่างแล้ว" : "บันทึกแล้ว"} · ${bkkClock(savedAt)}`;
  return (
    <span className={cn("tnum inline-flex items-center gap-1.5 text-[12px] text-text-2", state === "error" && "text-danger")} aria-live="polite">
      {state !== "saving" && !dirty && state !== "error" && <Check className="size-3.5" aria-hidden />}
      {text}
    </span>
  );
}

// ───────── Step 1 — รายละเอียด ─────────
function StepDetails({
  form,
  set,
  options,
  data,
  titleLen,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  options: EditorOptions;
  data: EditorData;
  titleLen: number;
}) {
  const job = useUploads((s) => s.jobs[data.id]);
  const dismiss = useUploads((s) => s.dismissSuggestion);

  return (
    <div className="space-y-10">
      {job?.suggestedShort && form.type === "short" && (
        <div className="flex items-start gap-3 rounded-[14px] border border-border bg-elevated px-4 py-3" role="status">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-text-2" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">ระบบแนะนำให้เป็น Short</p>
            <p className="t-meta">วิดีโอเป็นแนวตั้งและยาวไม่ถึง 3 นาที จึงตั้งเป็น Short ให้แล้ว เปลี่ยนกลับเป็นวิดีโอได้</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              set("type", "video");
              dismiss(data.id);
            }}
          >
            ใช้เป็นวิดีโอ
          </Button>
          <button type="button" onClick={() => dismiss(data.id)} className="rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label="ปิดคำแนะนำ">
            <X className="size-4" />
          </button>
        </div>
      )}

      <Section title="ข้อมูลหลัก">
        {form.type !== "podcast" && (
          <div className="mb-5">
            <p className="mb-1.5 text-[13px] font-medium">ประเภท</p>
            <div className="inline-flex rounded-full border border-border p-1" role="radiogroup" aria-label="ประเภท">
              {(["video", "short"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.type === t}
                  onClick={() => set("type", t)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                    form.type === t ? "bg-text text-bg" : "text-text-2 hover:text-text",
                  )}
                >
                  {t === "video" ? <Clapperboard className="size-4" /> : <Smartphone className="size-4" />}
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="ชื่อ (จำเป็น)" counter={`${titleLen}/100`}>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={120}
            className={cn(inputClass, (titleLen > 100 || !form.title.trim()) && "border-danger/60")}
            placeholder="ตั้งชื่อที่บอกว่าคนดูจะได้อะไร"
            aria-invalid={titleLen > 100 || !form.title.trim()}
            required
          />
        </Field>
        {titleLen > 100 && <p className="t-caption mt-1 text-danger">ชื่อยาวเกิน 100 ตัวอักษร</p>}
        {!form.title.trim() && <p className="t-caption mt-1 text-danger">กรุณาใส่ชื่อ</p>}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Field label="คำอธิบาย" counter={`${form.description.length.toLocaleString("th-TH")}/5,000`}>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={12}
              className={cn(inputClass, "min-h-[260px] resize-y leading-6", form.description.length > 5000 && "border-danger/60")}
              placeholder={"เล่าว่าคลิปนี้เกี่ยวกับอะไร\n\n0:00 บทนำ\n1:30 หัวข้อที่ 1\n5:00 สรุป\n\n#digitalproduct"}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">พรีวิว</p>
            <div className="min-h-[260px] rounded-[12px] border border-dashed border-border px-3.5 py-2.5">
              <DescriptionPreview text={form.description} />
            </div>
          </div>
        </div>
        {form.description.length > 5000 && <p className="t-caption mt-1 text-danger">คำอธิบายยาวเกิน 5,000 ตัวอักษร</p>}

        <div className="mt-5 rounded-[14px] border border-border bg-elevated/40 px-4 py-3.5">
          <p className="mb-2 text-[13px] font-medium">Chapters</p>
          <ChaptersPreview description={form.description} />
        </div>
      </Section>

      <Section title="ลิงก์" description="ปุ่มลิงก์ใต้คลิป สูงสุด 5 รายการ ลากเพื่อเรียงลำดับ">
        <LinksEditor links={form.links} onChange={(v) => set("links", v)} />
      </Section>

      <Section title="ภาพปก" description={`แนะนำ ${COVER_SIZE[form.type]} พิกเซล · JPG, PNG หรือ WebP ไม่เกิน 2MB`}>
        <CoverPicker form={form} set={set} options={options} data={data} />
      </Section>

      <Section title="ไฟล์ประกอบ" description="PDF หรือ ZIP ดาวน์โหลดได้เฉพาะสมาชิก">
        <ResourcesEditor value={form.resources} onChange={(v) => set("resources", v)} />
      </Section>

      <Section title="Playlist" description="เลือกได้หลาย Playlist">
        {options.playlists.length === 0 ? (
          <p className="t-meta">
            ยังไม่มี Playlist ·{" "}
            <Link href="/studio/playlists?new=1" className="underline">
              สร้าง Playlist
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.playlists.map((p) => {
              const on = form.playlist_ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("playlist_ids", on ? form.playlist_ids.filter((x) => x !== p.id) : [...form.playlist_ids, p.id])}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                    on ? "border-transparent bg-text text-bg" : "border-border text-text hover:bg-hover",
                  )}
                >
                  {on ? <Check className="size-3.5" /> : <Plus className="size-3.5 text-text-2" />}
                  {p.title}
                  {p.visibility === "members" && <Lock className={cn("size-3.5", on ? "text-bg" : "text-member")} aria-label="เฉพาะสมาชิก" />}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="หมวดหมู่และแท็ก">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
          <Field label="หมวดหมู่">
            <select
              value={form.category_id ?? ""}
              onChange={(e) => set("category_id", e.target.value || null)}
              className={cn(inputClass, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9")}
              style={selectStyle}
            >
              <option value="">ไม่ระบุ</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-1.5 flex justify-between text-[13px] font-medium">
              แท็ก <span className="t-caption tnum text-text-2">{form.tags.length}/10</span>
            </p>
            <TagInput value={form.tags} onChange={(v) => set("tags", v)} />
          </div>
        </div>
      </Section>

      {form.type === "short" && (
        <Section title="ผูกคลิปเต็ม" description="ปุ่ม “ดูคลิปเต็ม” บน Short จะพาไปที่วิดีโอนี้">
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="วิดีโอ">
              <select
                value={form.linked_content_id ?? ""}
                onChange={(e) => set("linked_content_id", e.target.value || null)}
                className={cn(inputClass, "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9")}
                style={selectStyle}
              >
                <option value="">ไม่ผูก</option>
                {options.videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="เริ่มที่ (ไม่บังคับ)" hint="เช่น 12:34">
              <input
                value={form.linked_start}
                onChange={(e) => set("linked_start", e.target.value)}
                disabled={!form.linked_content_id}
                inputMode="numeric"
                placeholder="0:00"
                className={cn(inputClass, "tnum", mmssToSec(form.linked_start) === undefined && "border-danger/60")}
              />
            </Field>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[16px] font-semibold">{title}</h3>
      {description && <p className="t-meta mt-0.5">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LinksEditor({ links, onChange }: { links: LinkRow[]; onChange: (v: LinkRow[]) => void }) {
  const update = (k: string, p: Partial<LinkRow>) => onChange(links.map((l) => (l.key === k ? { ...l, ...p } : l)));
  return (
    <div>
      {links.length > 0 && (
        <SortableList items={links} getId={(l) => l.key} onReorder={onChange} className="space-y-2" label="เรียงลำดับลิงก์">
          {(l, i) => {
            const bad = !!l.url.trim() && !isValidUrl(l.url.trim());
            return (
              <SortableItem key={l.key} id={l.key} className="items-start" handleLabel={`ลากเพื่อย้ายลิงก์ที่ ${i + 1}`}>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[200px_1fr]">
                  <input
                    value={l.label}
                    onChange={(e) => update(l.key, { label: e.target.value.slice(0, 40) })}
                    placeholder="ชื่อปุ่ม เช่น ดาวน์โหลด Template"
                    aria-label={`ชื่อปุ่มลิงก์ที่ ${i + 1}`}
                    className={inputClass}
                  />
                  <div>
                    <input
                      value={l.url}
                      onChange={(e) => update(l.key, { url: e.target.value })}
                      placeholder="https://"
                      inputMode="url"
                      aria-label={`URL ลิงก์ที่ ${i + 1}`}
                      aria-invalid={bad}
                      className={cn(inputClass, bad && "border-danger/60")}
                    />
                    {bad && <p className="t-caption mt-1 text-danger">URL ต้องขึ้นต้นด้วย http:// หรือ https://</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(links.filter((x) => x.key !== l.key))}
                  className="mt-1.5 rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text"
                  aria-label={`ลบลิงก์ที่ ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </SortableItem>
            );
          }}
        </SortableList>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={links.length >= 5}
        onClick={() => onChange([...links, { key: key(), label: "", url: "" }])}
      >
        <Plus /> เพิ่มลิงก์ <span className="tnum text-text-2">{links.length}/5</span>
      </Button>
    </div>
  );
}

function CoverPicker({
  form,
  set,
  options,
  data,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  options: EditorOptions;
  data: EditorData;
}) {
  const file = useUploads((s) => s.jobs[data.id]?.file ?? null);
  const [frames, setFrames] = React.useState<string[] | null>(null);
  const [frameError, setFrameError] = React.useState(false);
  const [warn, setWarn] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const autoPicked = React.useRef(false);
  const formRef = React.useRef(form);
  formRef.current = form;

  React.useEffect(() => {
    if (!file || form.type === "podcast" || !file.type.startsWith("video/")) return;
    let alive = true;
    setFrames(null);
    setFrameError(false);
    captureFrames(file)
      .then((f) => {
        if (!alive) return;
        setFrames(f);
        if (!formRef.current.thumbnail_url && !autoPicked.current && f[0]) {
          autoPicked.current = true;
          set("thumbnail_url", f[0]);
        }
      })
      .catch(() => alive && setFrameError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, form.type === "podcast"]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      toast("รองรับเฉพาะ JPG, PNG หรือ WebP");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast(`ไฟล์ใหญ่เกิน 2MB (${formatBytes(f.size)})`);
      return;
    }
    const url = await readAsDataUrl(f);
    set("thumbnail_url", url);
    const { w, h } = await imageSize(url).catch(() => ({ w: 0, h: 0 }));
    const want = COVER_RATIO[form.type];
    setWarn(w && h && Math.abs(w / h - want) > 0.03 ? `ภาพขนาด ${w}×${h} สัดส่วนไม่ตรงกับที่แนะนำ (${COVER_SIZE[form.type]}) ภาพอาจถูกครอป` : null);
  };

  const ratioCls = form.type === "short" ? "aspect-[9/16] w-24" : form.type === "podcast" ? "aspect-square w-32" : "aspect-video w-full";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className={cn("grid gap-3", form.type === "video" ? "grid-cols-2 sm:grid-cols-4" : "flex flex-wrap")}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-[var(--border-strong)] text-[12px] text-text-2 transition-colors hover:bg-hover hover:text-text",
              ratioCls,
            )}
          >
            <ImagePlus className="size-5" strokeWidth={1.75} aria-hidden />
            อัปโหลดภาพ
          </button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
          {form.type !== "podcast" &&
            file &&
            (frames
              ? frames.map((f, i) => {
                  const on = form.thumbnail_url === f;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => set("thumbnail_url", f)}
                      aria-pressed={on}
                      aria-label={`ใช้เฟรมที่ ${i + 1} เป็นภาพปก`}
                      className={cn("relative overflow-hidden rounded-[12px] ring-offset-2 ring-offset-surface transition", ratioCls, on ? "ring-2 ring-text" : "opacity-80 hover:opacity-100")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f} alt="" className="absolute inset-0 size-full object-cover" />
                      {on && (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-text text-bg">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  );
                })
              : !frameError && [0, 1, 2].map((i) => <div key={i} className={cn("skeleton rounded-[12px]", ratioCls)} />))}
        </div>
        {form.type !== "podcast" && (
          <p className="t-caption mt-2 text-text-2">
            {file
              ? frameError
                ? "สร้างภาพจากวิดีโอนี้ไม่ได้ ลองอัปโหลดภาพปกเอง"
                : "เลือก 1 ใน 3 เฟรมที่ระบบสุ่มจากวิดีโอ หรืออัปโหลดภาพเอง"
              : "เฟรมจากวิดีโอเลือกได้ระหว่างอัปโหลดไฟล์จากเครื่องนี้"}
          </p>
        )}
        {warn && <p className="t-caption mt-2 text-text-2">{warn}</p>}
        {form.thumbnail_url && (
          <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => (set("thumbnail_url", null), setWarn(null))}>
            <X /> นำภาพปกออก
          </Button>
        )}
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium">พรีวิวบนหน้า Home</p>
        <div className="rounded-[14px] border border-border bg-bg p-4">
          <CardPreview
            type={form.type}
            title={form.title}
            thumb={form.thumbnail_url}
            duration={data.duration_sec}
            visibility={form.visibility}
            channelName={options.channelName}
            channelAvatar={options.channelAvatar}
          />
        </div>
      </div>
    </div>
  );
}

function ResourcesEditor({ value, onChange }: { value: Resource[]; onChange: (v: Resource[]) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-3 divide-y divide-border rounded-[12px] border border-border">
          {value.map((r, i) => (
            <li key={`${r.file_name}-${i}`} className="flex items-center gap-3 px-3.5 py-2.5">
              <FileText className="size-5 shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[14px]">{r.file_name}</span>
              <span className="t-caption tnum text-text-2">{formatBytes(r.size_bytes)}</span>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label={`ลบไฟล์ ${r.file_name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={ref}
        type="file"
        multiple
        accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          const ok = files.filter((f) => /\.(pdf|zip)$/i.test(f.name));
          if (ok.length < files.length) toast("รองรับเฉพาะไฟล์ PDF และ ZIP");
          if (ok.length) onChange([...value, ...ok.map((f) => ({ file_name: f.name, size_bytes: f.size }))]);
        }}
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
        <Paperclip /> แนบไฟล์
      </Button>
    </div>
  );
}

// ───────── Step 2 — ตั้งค่า ─────────
function StepSettings({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const cueCount = form.captions_vtt ? (form.captions_vtt.match(/-->/g) ?? []).length : 0;
  return (
    <div className="space-y-10">
      <Section title="ความคิดเห็น">
        <label className="flex items-center justify-between gap-4 rounded-[14px] border border-border px-4 py-3.5">
          <span>
            <span className="block text-[14px] font-medium">เปิดให้แสดงความคิดเห็น</span>
            <span className="t-meta">ปิดแล้วความคิดเห็นเดิมยังอยู่ แต่จะซ่อนจากหน้าคลิป</span>
          </span>
          <Switch checked={form.comments_enabled} onCheckedChange={(v) => set("comments_enabled", v)} aria-label="เปิดความคิดเห็น" />
        </label>
      </Section>
      {form.type !== "podcast" && (
        <Section title="คำบรรยาย" description="อัปโหลดไฟล์ .vtt (ไม่บังคับ)">
          {form.captions_vtt ? (
            <div className="flex items-center gap-3 rounded-[14px] border border-border px-4 py-3">
              <Captions className="size-5 text-text-2" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 text-[14px]">
                แนบคำบรรยายแล้ว <span className="tnum text-text-2">· {cueCount} บรรทัด</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => ref.current?.click()}>
                เปลี่ยนไฟล์
              </Button>
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => set("captions_vtt", null)}>
                ลบ
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
              <Captions /> อัปโหลดไฟล์ .vtt
            </Button>
          )}
          <input
            ref={ref}
            type="file"
            accept=".vtt,text/vtt"
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 1024 * 1024) return void toast("ไฟล์คำบรรยายใหญ่เกิน 1MB");
              const text = await f.text();
              if (!text.replace(/^﻿/, "").startsWith("WEBVTT")) return void toast("ไฟล์ต้องเป็นรูปแบบ WebVTT (.vtt)");
              set("captions_vtt", text);
              toast("แนบคำบรรยายแล้ว");
            }}
          />
        </Section>
      )}
    </div>
  );
}

// ───────── Step 3 — การมองเห็น ─────────
function StepVisibility({
  form,
  set,
  pubMode,
  setPubMode,
  scheduleAt,
  setScheduleAt,
  mediaReady,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  pubMode: PubMode;
  setPubMode: (m: PubMode) => void;
  scheduleAt: string;
  setScheduleAt: (v: string) => void;
  mediaReady: boolean;
}) {
  const minInput = isoToBkkInput(new Date().toISOString());
  return (
    <div className="space-y-10">
      <Section title="ใครดูได้">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="การมองเห็น">
          <RadioCard
            checked={form.visibility === "public"}
            onSelect={() => set("visibility", "public")}
            icon={<Globe className="size-5 text-text-2" strokeWidth={1.75} />}
            title="สาธารณะ"
            body="ทุกคนดูได้ ไม่ต้องเป็นสมาชิก"
          />
          <RadioCard
            checked={form.visibility === "members"}
            onSelect={() => set("visibility", "members")}
            icon={<Lock className="size-5 text-member" strokeWidth={2} />}
            title="เฉพาะสมาชิก"
            body="ทุกคนเห็นชื่อและภาพปก แต่ดูได้เฉพาะสมาชิก"
          />
        </div>
      </Section>
      <Section title="สถานะ">
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="สถานะการเผยแพร่">
          <RadioCard checked={pubMode === "draft"} onSelect={() => setPubMode("draft")} title="ฉบับร่าง" body="เก็บไว้ก่อน ยังไม่แสดงบนเว็บ" />
          <RadioCard
            checked={pubMode === "publish"}
            onSelect={() => setPubMode("publish")}
            title="เผยแพร่ทันที"
            body={mediaReady ? "แสดงบนเว็บและแจ้งเตือนผู้ติดตามทันที" : "ระบบจะเผยแพร่ให้อัตโนมัติเมื่อประมวลผลเสร็จ"}
          />
          <RadioCard checked={pubMode === "schedule"} onSelect={() => setPubMode("schedule")} title="ตั้งเวลา" body="เลือกวันและเวลาเผยแพร่ (เวลาประเทศไทย)" />
        </div>
        {pubMode === "schedule" && (
          <div className="mt-4 max-w-xs">
            <Field label="วันและเวลาเผยแพร่" hint={scheduleAt ? `เผยแพร่ ${thaiDateTime(bkkInputToIso(scheduleAt))} (เวลาประเทศไทย)` : "เวลาประเทศไทย (GMT+7)"}>
              <input type="datetime-local" value={scheduleAt} min={minInput} onChange={(e) => setScheduleAt(e.target.value)} className={cn(inputClass, "tnum")} />
            </Field>
          </div>
        )}
      </Section>
    </div>
  );
}

function RadioCard({
  checked,
  onSelect,
  title,
  body,
  icon,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-[14px] border px-4 py-3.5 text-left transition-colors",
        checked ? "border-text bg-hover" : "border-border hover:bg-hover",
      )}
    >
      <span
        className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2", checked ? "border-text" : "border-[var(--border-strong)]")}
        aria-hidden
      >
        {checked && <span className="size-2 rounded-full bg-text" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          {icon}
          {title}
        </span>
        <span className="t-meta mt-0.5 block">{body}</span>
      </span>
    </button>
  );
}
