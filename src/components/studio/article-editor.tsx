"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, ImagePlus, Loader2, Lock, Globe, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { Markdown } from "@/components/community/markdown";
import { AiWriterPanel } from "./ai-writer-panel";
import { saveArticleAction, signArticleImageAction } from "@/app/studio/community-actions";
import { ACCEPT_IMAGES, prepareImage, putImage } from "@/lib/client/images";
import { POST_LIMITS, readMinutes } from "@/lib/community";
import { formatNumber } from "@/lib/format";
import type { StudioArticleFull } from "@/lib/server/community";
import { cn } from "@/lib/utils";

/** `datetime-local` value (browser time zone) from an ISO string. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pick → resize → straight to Storage via a signed URL → public URL. */
async function uploadArticleImage(file: File): Promise<string> {
  const img = await prepareImage(file);
  const signed = await signArticleImageAction(img.contentType);
  if (!signed.ok) throw new Error(signed.error);
  await putImage(signed.data.uploadUrl, img);
  return signed.data.publicUrl;
}

export function ArticleEditor({ initial }: { initial?: StudioArticleFull }) {
  const router = useRouter();
  const [id, setId] = React.useState(initial?.id);
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = React.useState(initial?.excerpt ?? "");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [cover, setCover] = React.useState<string | null>(initial?.cover_url ?? null);
  const [visibility, setVisibility] = React.useState<"public" | "members">(initial?.visibility ?? "public");
  const [status, setStatus] = React.useState<"draft" | "published">(initial?.status ?? "draft");
  const [publishAt, setPublishAt] = React.useState("");
  // local time zone is only known in the browser, so fill it after hydration
  React.useEffect(() => setPublishAt(toLocalInput(initial?.published_at ?? null)), [initial?.published_at]);
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [saving, setSaving] = React.useState<null | "draft" | "published">(null);
  const [uploading, setUploading] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);
  const bodyInput = React.useRef<HTMLInputElement>(null);
  const bodyArea = React.useRef<HTMLTextAreaElement>(null);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const minutes = readMinutes(body);
  const titleOk = title.trim().length > 0 && title.length <= POST_LIMITS.title;
  const bodyOk = body.length <= POST_LIMITS.article;
  const flagged = (body.match(/\[ตรวจสอบ\]/g) ?? []).length;

  const save = async (next: "draft" | "published") => {
    if (!titleOk) return toast("ใส่ชื่อบทความก่อน");
    if (!bodyOk) return toast("เนื้อหายาวเกินไป");
    if (next === "published" && !body.trim()) return toast("เขียนเนื้อหาก่อนเผยแพร่");
    if (next === "published" && flagged > 0 && !confirm(`ยังมี [ตรวจสอบ] ค้างอยู่ ${flagged} จุด เผยแพร่เลยไหม?`)) return;
    setSaving(next);
    const r = await saveArticleAction({
      id,
      title,
      excerpt,
      body,
      cover_url: cover,
      visibility,
      status: next,
      published_at: next === "published" && publishAt ? new Date(publishAt).toISOString() : null,
    });
    setSaving(null);
    if (!r.ok) return toast(r.error);
    setStatus(next);
    setDirty(false);
    toast(next === "published" ? "เผยแพร่แล้ว" : "บันทึกฉบับร่างแล้ว");
    if (!id) {
      setId(r.data.id);
      router.replace(`/studio/articles/${r.data.id}/edit`);
    } else router.refresh();
  };

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      touch(setCover)(await uploadArticleImage(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const insertImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadArticleImage(file);
      const el = bodyArea.current;
      const at = el?.selectionStart ?? body.length;
      const md = `\n\n![](${url})\n\n`;
      touch(setBody)(body.slice(0, at) + md + body.slice(el?.selectionEnd ?? at));
      toast("แทรกรูปแล้ว");
    } catch (e) {
      toast(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const isPublished = status === "published" && !!initial && initial.status === "published";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/studio/articles">
            <ArrowLeft /> บทความ
          </Link>
        </Button>
        <span className="t-meta">
          {id ? (status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง") : "บทความใหม่"}
          {dirty && " · ยังไม่ได้บันทึก"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {id && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/community/articles/${id}`} target="_blank">
                ดูหน้าบทความ <ExternalLink />
              </Link>
            </Button>
          )}
          <Button variant="secondary" onClick={() => save("draft")} disabled={!!saving || uploading}>
            {saving === "draft" && <Loader2 className="animate-spin" />}
            {isPublished ? "เปลี่ยนเป็นฉบับร่าง" : "บันทึกฉบับร่าง"}
          </Button>
          <Button variant="inverse" onClick={() => save("published")} disabled={!!saving || uploading}>
            {saving === "published" && <Loader2 className="animate-spin" />}
            {isPublished ? "บันทึกการแก้ไข" : "เผยแพร่"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Field label="ชื่อบทความ (จำเป็น)" counter={`${title.length}/${POST_LIMITS.title}`}>
            <input
              value={title}
              onChange={(e) => touch(setTitle)(e.target.value)}
              maxLength={POST_LIMITS.title + 20}
              placeholder="ชื่อที่บอกว่าอ่านแล้วจะได้อะไร"
              className={cn(inputClass, "text-[18px] font-semibold", title.length > POST_LIMITS.title && "border-danger/60")}
            />
          </Field>

          <AiWriterPanel
            title={title}
            body={body}
            onBody={touch(setBody)}
            onUseTitle={(t) => {
              touch(setTitle)(t.slice(0, POST_LIMITS.title));
              toast("ใช้ชื่อที่ AI เสนอแล้ว");
            }}
            onUseExcerpt={(t) => {
              touch(setExcerpt)(t.slice(0, POST_LIMITS.excerpt));
              toast("ใช้บทคัดย่อที่ AI เสนอแล้ว");
            }}
          />

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border p-1" role="tablist" aria-label="โหมดเนื้อหา">
                {(
                  [
                    ["edit", "เขียน"],
                    ["preview", "พรีวิว"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={mode === k}
                    onClick={() => setMode(k)}
                    className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors", mode === k ? "bg-text text-bg" : "text-text-2 hover:text-text")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input ref={bodyInput} type="file" accept={ACCEPT_IMAGES} hidden onChange={(e) => { void insertImage(e.target.files?.[0]); e.target.value = ""; }} />
              {mode === "edit" && (
                <Button variant="ghost" size="sm" onClick={() => bodyInput.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} แทรกรูป
                </Button>
              )}
              <span className={cn("t-caption tnum ml-auto", !bodyOk ? "text-danger" : "text-text-2")}>
                {formatNumber(body.length)}/{formatNumber(POST_LIMITS.article)} · อ่านราว {minutes} นาที
                {flagged > 0 && <b className="ml-2 font-semibold text-member">รอตรวจสอบ {flagged} จุด</b>}
              </span>
            </div>
            {mode === "edit" ? (
              <textarea
                ref={bodyArea}
                value={body}
                onChange={(e) => touch(setBody)(e.target.value)}
                rows={26}
                spellCheck={false}
                placeholder={"เขียนด้วย Markdown\n\n## หัวข้อ\nย่อหน้าสั้น ๆ\n\n- ข้อ 1\n- ข้อ 2"}
                className={cn(inputClass, "min-h-[480px] resize-y font-mono text-[14px] leading-[24px]", !bodyOk && "border-danger/60")}
                aria-label="เนื้อหาบทความ (Markdown)"
              />
            ) : (
              <div className="min-h-[480px] rounded-[12px] border border-border bg-bg px-5 py-6 sm:px-8">
                <div className="mx-auto max-w-[680px]">
                  <h1 className="text-balance text-[30px] font-semibold leading-[1.35] tracking-[-0.015em]">{title || "ชื่อบทความ"}</h1>
                  <div className="mt-8">
                    {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-text-2">ยังไม่มีเนื้อหา</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-[16px] border border-border bg-surface p-5">
            <h3 className="text-[15px] font-semibold">รูปปก</h3>
            <input ref={coverInput} type="file" accept={ACCEPT_IMAGES} hidden onChange={(e) => { void pickCover(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="relative mt-3 aspect-video overflow-hidden rounded-[12px] border border-dashed border-border bg-elevated">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <button onClick={() => coverInput.current?.click()} disabled={uploading} className="flex size-full flex-col items-center justify-center gap-1 text-[13px] text-text-2 hover:text-text">
                  {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                  อัปโหลดรูปปก 16:9
                </button>
              )}
              {cover && uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="size-5 animate-spin text-white" />
                </span>
              )}
            </div>
            {cover && (
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => coverInput.current?.click()} disabled={uploading}>
                  เปลี่ยนรูป
                </Button>
                <Button variant="ghost" size="sm" onClick={() => touch(setCover)(null)} disabled={uploading}>
                  <X /> เอาออก
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-[16px] border border-border bg-surface p-5">
            <Field label="บทคัดย่อ" counter={`${excerpt.length}/${POST_LIMITS.excerpt}`} hint="แสดงในรายการและตอนแชร์ ถ้าเว้นว่างจะดึงจากต้นบทความ">
              <textarea
                value={excerpt}
                onChange={(e) => touch(setExcerpt)(e.target.value.slice(0, POST_LIMITS.excerpt))}
                rows={4}
                className={cn(inputClass, "resize-y leading-6")}
                placeholder="1-2 ประโยคที่บอกว่าอ่านแล้วจะได้อะไร"
              />
            </Field>
          </section>

          <section className="rounded-[16px] border border-border bg-surface p-5">
            <p className="mb-2 text-[13px] font-medium">ใครอ่านได้</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="การมองเห็น">
              {(
                [
                  ["public", "สาธารณะ", Globe],
                  ["members", "เฉพาะสมาชิก", Lock],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={visibility === k}
                  onClick={() => touch(setVisibility)(k)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2.5 text-[13px] font-medium transition-colors",
                    visibility === k ? "border-text bg-hover" : "border-border text-text-2 hover:text-text",
                  )}
                >
                  <Icon className={cn("size-4", k === "members" && visibility === k && "text-member")} /> {label}
                </button>
              ))}
            </div>
            <p className="t-caption mt-2 text-text-2">
              {visibility === "members" ? "คนทั่วไปเห็นชื่อ รูปปก และบทคัดย่อ แต่ต้องเป็นสมาชิกจึงอ่านเนื้อหาได้" : "ใครก็อ่านได้ ค้นเจอจาก Google ได้"}
            </p>

            <div className="mt-5">
              <Field label="วันที่เผยแพร่" hint="เว้นว่าง = ตอนกดเผยแพร่ ตั้งเป็นอนาคตเพื่อเผยแพร่ตามเวลา (ใช้กับปุ่มเผยแพร่)">
                <input type="datetime-local" value={publishAt} onChange={(e) => touch(setPublishAt)(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
