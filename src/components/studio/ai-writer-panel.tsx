"use client";
import * as React from "react";
import { ChevronDown, Loader2, Sparkles, Square, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { AI_ERROR_MARKER } from "@/lib/community";
import { cn } from "@/lib/utils";

type Length = "short" | "medium" | "long";
type Edit = "polish" | "shorten" | "expand";

const LENGTHS: { key: Length; label: string }[] = [
  { key: "short", label: "สั้น ~600 คำ" },
  { key: "medium", label: "กลาง ~1200 คำ" },
  { key: "long", label: "ยาว ~2000 คำ" },
];

const EDITS: { key: Edit; label: string; busy: string }[] = [
  { key: "polish", label: "เกลาภาษา", busy: "กำลังเกลาภาษา…" },
  { key: "shorten", label: "ทำให้สั้นลง", busy: "กำลังย่อ…" },
  { key: "expand", label: "เพิ่มตัวอย่าง", busy: "กำลังเพิ่มตัวอย่าง…" },
];

interface Props {
  title: string;
  body: string;
  /** AI text lands in the editor only. Nothing here saves or publishes. */
  onBody: (text: string) => void;
  onUseTitle: (t: string) => void;
  onUseExcerpt: (t: string) => void;
}

/** "เขียนด้วย AI": draft a whole article, or rework the current body. JR reviews everything before publishing. */
export function AiWriterPanel({ title, body, onBody, onUseTitle, onUseExcerpt }: Props) {
  const [open, setOpen] = React.useState(false);
  const [topic, setTopic] = React.useState("");
  const [points, setPoints] = React.useState("");
  const [audience, setAudience] = React.useState("");
  const [length, setLength] = React.useState<Length>("medium");
  const [busy, setBusy] = React.useState<null | "draft" | Edit | "meta">(null);
  const [noKey, setNoKey] = React.useState(false);
  const [suggest, setSuggest] = React.useState<{ title: string; excerpt: string } | null>(null);
  const [backup, setBackup] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  /** POST to the admin AI route. Streams text into the editor; resolves to the final text when it finished cleanly. */
  const stream = async (payload: Record<string, unknown>, kind: "draft" | Edit): Promise<string | null> => {
    const ac = new AbortController();
    abort.current = ac;
    setBusy(kind);
    const before = body;
    let text = "";
    let failed = false;
    try {
      const res = await fetch("/api/studio/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (j.code === "no_key") setNoKey(true);
        toast(j.error ?? "เรียก AI ไม่สำเร็จ");
        return null;
      }
      setBackup(before);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        const cut = text.indexOf(AI_ERROR_MARKER);
        onBody(cut >= 0 ? text.slice(0, cut) : text);
      }
      text += dec.decode();
      const cut = text.indexOf(AI_ERROR_MARKER);
      if (cut >= 0) {
        failed = true;
        toast(text.slice(cut + AI_ERROR_MARKER.length).trim() || "AI ทำงานไม่สำเร็จ");
        onBody(text.slice(0, cut).trimEnd());
      } else onBody(text.trim());
      return !failed && text.trim().length > 0 ? text.trim() : null;
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast("หยุดแล้ว เนื้อหาที่ได้ถูกใส่ไว้ในช่องเขียน");
        return null;
      }
      toast("เชื่อมต่อ AI ไม่ได้ ลองใหม่อีกครั้ง");
      return null;
    } finally {
      abort.current = null;
      setBusy(null);
    }
  };

  const fetchSuggestion = async (text: string) => {
    setBusy("meta");
    try {
      const res = await fetch("/api/studio/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "meta", body: text, title }),
      });
      const j = (await res.json()) as { title?: string; excerpt?: string; error?: string };
      if (!res.ok) return toast(j.error ?? "เสนอชื่อบทความไม่สำเร็จ");
      setSuggest({ title: j.title ?? "", excerpt: j.excerpt ?? "" });
    } catch {
      toast("เสนอชื่อบทความไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const draft = async () => {
    if (!topic.trim()) return toast("ใส่หัวข้อก่อน");
    if (body.trim() && !confirm("ร่างใหม่จะแทนที่เนื้อหาที่เขียนไว้ในช่อง (กด “ย้อนกลับ” เพื่อเอากลับได้) ทำต่อไหม?")) return;
    setSuggest(null);
    const out = await stream({ mode: "draft", topic, points, audience, length }, "draft");
    if (out) {
      toast("ร่างเสร็จแล้ว ตรวจและแก้ก่อนเผยแพร่");
      await fetchSuggestion(out);
    }
  };

  const edit = async (key: Edit) => {
    if (body.trim().length < 40) return toast("ยังไม่มีเนื้อหาให้แก้ เขียนหรือร่างก่อน");
    await stream({ mode: key, body }, key);
  };

  const working = busy !== null;

  return (
    <section className="rounded-[16px] border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={open}>
        <span className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">เขียนด้วย AI</span>
          <span className="t-meta block">ให้ AI ร่างบทความหรือช่วยแก้ แล้วคุณตรวจก่อนเผยแพร่เสมอ</span>
        </span>
        <ChevronDown className={cn("size-5 text-text-2 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-5 pb-5 pt-4">
          {noKey && (
            <p className="rounded-[12px] border border-border bg-elevated px-4 py-3 text-[14px]" role="status">
              ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — เพิ่มใน .env.local และ Vercel แล้วรีสตาร์ท
            </p>
          )}

          <Field label="หัวข้อ (จำเป็น)" counter={`${topic.length}/500`}>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 500))}
              placeholder="เช่น ทำไมคนส่วนใหญ่ทำสินค้าดิจิทัลแล้วขายไม่ได้ชิ้นแรก"
              className={inputClass}
              disabled={working}
            />
          </Field>
          <Field label="ประเด็น / โครงเรื่อง (ถ้ามี)" hint="พิมพ์เป็นข้อ ๆ ได้ AI จะใช้เป็นแกนของบทความ" counter={`${points.length}/3000`}>
            <textarea
              value={points}
              onChange={(e) => setPoints(e.target.value.slice(0, 3000))}
              rows={4}
              placeholder={"- ขายให้ใครไม่ชัด\n- ราคาถูกเกินจนคนไม่เชื่อ\n- ไม่มีหลักฐานว่าใช้ได้จริง"}
              className={cn(inputClass, "resize-y leading-6")}
              disabled={working}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
            <div>
              <p className="mb-1.5 text-[13px] font-medium">ความยาว</p>
              <div className="inline-flex flex-wrap rounded-full border border-border p-1" role="radiogroup" aria-label="ความยาวบทความ">
                {LENGTHS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    role="radio"
                    aria-checked={length === l.key}
                    disabled={working}
                    onClick={() => setLength(l.key)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      length === l.key ? "bg-text text-bg" : "text-text-2 hover:text-text",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="กลุ่มผู้อ่าน (ถ้ามี)">
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value.slice(0, 300))}
                placeholder="เช่น มือใหม่ที่ยังไม่เคยขายอะไรออนไลน์"
                className={inputClass}
                disabled={working}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {busy === "draft" ? (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                <Square className="fill-current" /> หยุด
              </Button>
            ) : (
              <Button variant="primary" onClick={draft} disabled={working}>
                <Wand2 /> ร่างบทความ
              </Button>
            )}
            {busy === "draft" && (
              <span className="t-meta inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> กำลังเขียน…
              </span>
            )}
            {busy === "meta" && (
              <span className="t-meta inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> กำลังคิดชื่อและบทคัดย่อ…
              </span>
            )}
          </div>

          {suggest && (
            <div className="space-y-3 rounded-[12px] border border-border bg-elevated/60 p-4">
              <p className="text-[13px] font-semibold">AI เสนอ</p>
              <div>
                <p className="t-caption text-text-2">ชื่อบทความ</p>
                <p className="mt-0.5 text-[15px] font-medium">{suggest.title}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => onUseTitle(suggest.title)}>
                  ใช้ชื่อนี้
                </Button>
              </div>
              <div>
                <p className="t-caption text-text-2">บทคัดย่อ</p>
                <p className="mt-0.5 text-[14px] leading-6">{suggest.excerpt}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => onUseExcerpt(suggest.excerpt)}>
                  ใช้บทคัดย่อนี้
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-[13px] font-medium">ช่วยแก้บทความที่เขียนอยู่</p>
            <div className="flex flex-wrap items-center gap-2">
              {EDITS.map((e) => (
                <Button key={e.key} variant="secondary" size="sm" onClick={() => edit(e.key)} disabled={working}>
                  {busy === e.key ? <Loader2 className="animate-spin" /> : null}
                  {busy === e.key ? e.busy : e.label}
                </Button>
              ))}
              {EDITS.some((e) => e.key === busy) && (
                <Button variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
                  <Square className="fill-current" /> หยุด
                </Button>
              )}
              {backup !== null && !working && backup !== body && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onBody(backup);
                    setBackup(null);
                  }}
                >
                  <Undo2 /> ย้อนกลับ
                </Button>
              )}
            </div>
          </div>

          <p className="t-caption text-text-2">
            AI อาจเขียนผิดหรือเดาข้อมูล ประโยคที่มี <b className="font-semibold text-text">[ตรวจสอบ]</b> คือจุดที่ต้องเช็กข้อเท็จจริงก่อนเผยแพร่ AI ใส่ข้อความในช่องเขียนเท่านั้น ไม่เผยแพร่เอง
          </p>
        </div>
      )}
    </section>
  );
}
