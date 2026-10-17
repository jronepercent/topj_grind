"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Play, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { runSchedulerAction, saveBannedWordsAction, saveCategoriesAction, saveSettingsAction } from "@/app/studio/actions";
import { isValidUrl } from "@/lib/richtext";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "@/lib/types";
import { SortableItem, SortableList } from "./sortable";
import { Card, CardHeader } from "./ui";
import { readAsDataUrl } from "./editor-parts";

type Social = SiteSettings["socials"][number] & { k: string };
const rid = () => Math.random().toString(36).slice(2);

export function SettingsForm({
  settings,
  categories,
  bannedWords,
}: {
  settings: SiteSettings;
  categories: { id: string; name: string }[];
  bannedWords: string[];
}) {
  return (
    <div className="space-y-6">
      <ChannelCard settings={settings} />
      <CategoriesCard initial={categories} />
      <BannedWordsCard initial={bannedWords} />
      <PaywallCard settings={settings} />
      <SchedulerCard />
    </div>
  );
}

function SaveRow({ busy, onSave, dirty }: { busy: boolean; onSave: () => void; dirty: boolean }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
      {dirty && <span className="t-meta mr-auto">มีการแก้ไขที่ยังไม่บันทึก</span>}
      <Button variant="inverse" size="sm" onClick={onSave} disabled={busy || !dirty}>
        {busy ? "กำลังบันทึก…" : "บันทึก"}
      </Button>
    </div>
  );
}

function ImageField({
  label,
  value,
  onChange,
  hint,
  round,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  round?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const isData = value.startsWith("data:");
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn("relative shrink-0 overflow-hidden bg-elevated", round ? "size-16 rounded-full" : "aspect-[4/1] w-48 rounded-[10px]")}>
          {value && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="absolute inset-0 size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            value={isData ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isData ? "ใช้ภาพที่อัปโหลดแล้ว" : "https://"}
            aria-label={`${label} URL`}
            className={inputClass}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
              <ImagePlus /> อัปโหลด
            </Button>
            <span className="t-caption text-text-2">{hint}</span>
          </div>
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) return void toast("ไฟล์ใหญ่เกิน 2MB");
            onChange(await readAsDataUrl(f));
          }}
        />
      </div>
    </div>
  );
}

function ChannelCard({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const init = React.useMemo(
    () => ({
      channel_name: settings.channel_name,
      tagline: settings.tagline,
      avatar_url: settings.avatar_url,
      banner_url: settings.banner_url,
      about: settings.about,
      socials: settings.socials.map((s) => ({ ...s, k: rid() })) as Social[],
    }),
    [settings],
  );
  const [f, setF] = React.useState(init);
  const [base, setBase] = React.useState(JSON.stringify(init));
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== base;

  const save = async () => {
    if (!f.channel_name.trim()) return void toast("กรุณาใส่ชื่อช่อง");
    const socials = f.socials.filter((s) => s.label.trim() || s.url.trim());
    const bad = socials.find((s) => !s.label.trim() || !isValidUrl(s.url.trim()));
    if (bad) return void toast(bad.label.trim() ? `ลิงก์ไม่ถูกต้อง: ${bad.url || "(ว่าง)"}` : "กรุณาใส่ชื่อของลิงก์โซเชียล");
    setBusy(true);
    const r = await saveSettingsAction({
      channel_name: f.channel_name.trim(),
      tagline: f.tagline.trim(),
      avatar_url: f.avatar_url.trim(),
      banner_url: f.banner_url.trim(),
      about: f.about,
      socials: socials.map((s) => ({
        key: s.key || s.label.trim().toLowerCase().replace(/\s+/g, "-"),
        label: s.label.trim(),
        url: s.url.trim(),
      })),
    });
    setBusy(false);
    if (!r.ok) return void toast(r.error);
    setBase(JSON.stringify(f));
    toast("บันทึกข้อมูลช่องแล้ว");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader title="ข้อมูลช่อง" description="แสดงที่หน้า About และส่วนหัวของเว็บ" />
      <div className="space-y-5 px-5 pb-5 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อช่อง" counter={`${f.channel_name.length}/50`}>
            <input value={f.channel_name} onChange={(e) => set("channel_name", e.target.value.slice(0, 50))} className={inputClass} />
          </Field>
          <Field label="Tagline" counter={`${f.tagline.length}/120`}>
            <input value={f.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 120))} className={inputClass} />
          </Field>
        </div>
        <ImageField label="รูปโปรไฟล์" value={f.avatar_url} onChange={(v) => set("avatar_url", v)} hint="สี่เหลี่ยมจัตุรัส อย่างน้อย 320×320" round />
        <ImageField label="แบนเนอร์" value={f.banner_url} onChange={(v) => set("banner_url", v)} hint="แนะนำ 2560×640 ไม่เกิน 2MB" />
        <Field label="คำแนะนำตัว" counter={`${f.about.length.toLocaleString("th-TH")}/2,000`}>
          <textarea value={f.about} onChange={(e) => set("about", e.target.value.slice(0, 2000))} rows={6} className={cn(inputClass, "resize-y leading-6")} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">ลิงก์โซเชียล</p>
          <SortableList items={f.socials} getId={(s) => s.k} onReorder={(v) => set("socials", v)} className="space-y-2" label="เรียงลำดับลิงก์โซเชียล">
            {(s, i) => {
              const bad = !!s.url.trim() && !isValidUrl(s.url.trim());
              return (
                <SortableItem key={s.k} id={s.k} className="items-start" handleLabel={`ลากเพื่อย้ายลิงก์ ${s.label || i + 1}`}>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[160px_1fr]">
                    <input
                      value={s.label}
                      onChange={(e) => set("socials", f.socials.map((x) => (x.k === s.k ? { ...x, label: e.target.value.slice(0, 30) } : x)))}
                      placeholder="เช่น TikTok"
                      aria-label={`ชื่อลิงก์ที่ ${i + 1}`}
                      className={inputClass}
                    />
                    <input
                      value={s.url}
                      onChange={(e) => set("socials", f.socials.map((x) => (x.k === s.k ? { ...x, url: e.target.value } : x)))}
                      placeholder="https://"
                      inputMode="url"
                      aria-label={`URL ลิงก์ที่ ${i + 1}`}
                      aria-invalid={bad}
                      className={cn(inputClass, bad && "border-danger/60")}
                    />
                  </div>
                  <button type="button" onClick={() => set("socials", f.socials.filter((x) => x.k !== s.k))} className="mt-1.5 rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label={`ลบลิงก์ ${s.label || i + 1}`}>
                    <X className="size-4" />
                  </button>
                </SortableItem>
              );
            }}
          </SortableList>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => set("socials", [...f.socials, { k: rid(), key: "", label: "", url: "" }])}>
            <Plus /> เพิ่มลิงก์
          </Button>
        </div>
      </div>
      <SaveRow busy={busy} onSave={save} dirty={dirty} />
    </Card>
  );
}

function CategoriesCard({ initial }: { initial: { id: string; name: string }[] }) {
  const router = useRouter();
  const init = React.useMemo(() => initial.map((c) => ({ ...c, k: c.id })), [initial]);
  const [cats, setCats] = React.useState<{ id?: string; name: string; k: string }[]>(init);
  const [base, setBase] = React.useState(JSON.stringify(init));
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(cats) !== base;
  return (
    <Card>
      <CardHeader title="หมวดหมู่" description="ใช้กรองคลิปบนหน้าแรก ลากเพื่อเรียงลำดับ" />
      <div className="px-5 pb-5 pt-4">
        <SortableList items={cats} getId={(c) => c.k} onReorder={setCats} className="space-y-2" label="เรียงลำดับหมวดหมู่">
          {(c, i) => (
            <SortableItem key={c.k} id={c.k} handleLabel={`ลากเพื่อย้ายหมวด ${c.name || i + 1}`}>
              <input
                value={c.name}
                onChange={(e) => setCats((xs) => xs.map((x) => (x.k === c.k ? { ...x, name: e.target.value.slice(0, 40) } : x)))}
                aria-label={`ชื่อหมวดที่ ${i + 1}`}
                placeholder="ชื่อหมวดหมู่"
                className={cn(inputClass, "flex-1")}
              />
              <button type="button" onClick={() => setCats((xs) => xs.filter((x) => x.k !== c.k))} className="rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label={`ลบหมวด ${c.name || i + 1}`}>
                <X className="size-4" />
              </button>
            </SortableItem>
          )}
        </SortableList>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setCats((xs) => [...xs, { name: "", k: rid() }])}>
          <Plus /> เพิ่มหมวดหมู่
        </Button>
        <p className="t-caption mt-3 text-text-2">ลบหมวดแล้ว คลิปในหมวดนั้นจะกลายเป็น “ไม่ระบุหมวด”</p>
      </div>
      <SaveRow
        busy={busy}
        dirty={dirty}
        onSave={async () => {
          setBusy(true);
          const r = await saveCategoriesAction(cats.map((c) => ({ id: c.id, name: c.name })));
          setBusy(false);
          if (!r.ok) return void toast(r.error);
          const kept = cats.filter((c) => c.name.trim());
          setCats(kept);
          setBase(JSON.stringify(kept));
          toast("บันทึกหมวดหมู่แล้ว");
          router.refresh();
        }}
      />
    </Card>
  );
}

function BannedWordsCard({ initial }: { initial: string[] }) {
  const [text, setText] = React.useState(initial.join("\n"));
  const [base, setBase] = React.useState(initial.join("\n"));
  const [busy, setBusy] = React.useState(false);
  const count = text.split("\n").filter((w) => w.trim()).length;
  return (
    <Card>
      <CardHeader title="คำต้องห้ามในความคิดเห็น" description="ความคิดเห็นที่มีคำเหล่านี้จะถูกปฏิเสธอัตโนมัติ" />
      <div className="px-5 pb-5 pt-4">
        <Field label="หนึ่งคำต่อหนึ่งบรรทัด" counter={`${count} คำ`}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className={cn(inputClass, "resize-y leading-6")} />
        </Field>
      </div>
      <SaveRow
        busy={busy}
        dirty={text !== base}
        onSave={async () => {
          setBusy(true);
          const r = await saveBannedWordsAction(text.split("\n"));
          setBusy(false);
          if (!r.ok) return void toast(r.error);
          const clean = [...new Set(text.split("\n").map((w) => w.trim()).filter(Boolean))].join("\n");
          setText(clean);
          setBase(clean);
          toast("บันทึกคำต้องห้ามแล้ว");
        }}
      />
    </Card>
  );
}

function PaywallCard({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const init = React.useMemo(
    () => ({
      paywall_title: settings.paywall_title,
      benefits: settings.paywall_benefits.map((b) => ({ k: rid(), v: b })),
      price: String(settings.price_thb),
    }),
    [settings],
  );
  const [f, setF] = React.useState(init);
  const [base, setBase] = React.useState(JSON.stringify(init));
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(f) !== base;
  const price = Number(f.price);

  return (
    <Card>
      <CardHeader title="Paywall และราคา" description="ข้อความบนการ์ดสมัครสมาชิก" />
      <div className="space-y-5 px-5 pb-5 pt-4">
        <Field label="หัวข้อ Paywall" counter={`${f.paywall_title.length}/80`}>
          <input value={f.paywall_title} onChange={(e) => setF((x) => ({ ...x, paywall_title: e.target.value.slice(0, 80) }))} className={inputClass} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">สิทธิประโยชน์</p>
          <SortableList items={f.benefits} getId={(b) => b.k} onReorder={(v) => setF((x) => ({ ...x, benefits: v }))} className="space-y-2" label="เรียงลำดับสิทธิประโยชน์">
            {(b, i) => (
              <SortableItem key={b.k} id={b.k} handleLabel={`ลากเพื่อย้ายข้อที่ ${i + 1}`}>
                <input
                  value={b.v}
                  onChange={(e) => setF((x) => ({ ...x, benefits: x.benefits.map((y) => (y.k === b.k ? { ...y, v: e.target.value.slice(0, 80) } : y)) }))}
                  aria-label={`สิทธิประโยชน์ข้อที่ ${i + 1}`}
                  className={cn(inputClass, "flex-1")}
                />
                <button type="button" onClick={() => setF((x) => ({ ...x, benefits: x.benefits.filter((y) => y.k !== b.k) }))} className="rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label={`ลบข้อที่ ${i + 1}`}>
                  <X className="size-4" />
                </button>
              </SortableItem>
            )}
          </SortableList>
          <Button variant="outline" size="sm" className="mt-2" disabled={f.benefits.length >= 8} onClick={() => setF((x) => ({ ...x, benefits: [...x.benefits, { k: rid(), v: "" }] }))}>
            <Plus /> เพิ่มข้อ
          </Button>
        </div>
        <div className="max-w-[220px]">
          <Field label="ราคาที่แสดง (บาท / 30 วัน)">
            <input type="number" min={0} step={1} value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} className={cn(inputClass, "tnum")} />
          </Field>
        </div>
        <p className="t-caption text-text-2">ราคานี้ใช้แสดงผลเท่านั้น ยอดเงินจริงมาจากระบบชำระเงิน</p>
      </div>
      <SaveRow
        busy={busy}
        dirty={dirty}
        onSave={async () => {
          if (!f.paywall_title.trim()) return void toast("กรุณาใส่หัวข้อ Paywall");
          if (!Number.isFinite(price) || price < 0) return void toast("ราคาไม่ถูกต้อง");
          setBusy(true);
          const r = await saveSettingsAction({
            paywall_title: f.paywall_title.trim(),
            paywall_benefits: f.benefits.map((b) => b.v.trim()).filter(Boolean),
            price_thb: Math.round(price),
          });
          setBusy(false);
          if (!r.ok) return void toast(r.error);
          setBase(JSON.stringify(f));
          toast("บันทึก Paywall แล้ว");
          router.refresh();
        }}
      />
    </Card>
  );
}

function SchedulerCard() {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ published: string[]; reminded: number; at: string } | null>(null);
  return (
    <Card>
      <CardHeader title="ตัวช่วยทดสอบ" description="ปกติระบบรันงานตั้งเวลาทุกนาที และส่งแจ้งเตือนสมาชิกใกล้หมดอายุทุกวัน 09:00" />
      <div className="px-5 pb-5 pt-4">
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await runSchedulerAction();
            setBusy(false);
            if (!r.ok) return void toast(r.error);
            setResult({ published: r.data.published, reminded: r.data.reminded, at: new Date().toISOString() });
            toast("รันงานตั้งเวลาแล้ว");
          }}
        >
          <Play /> {busy ? "กำลังรัน…" : "รันงานตั้งเวลาตอนนี้"}
        </Button>
        {result && (
          <div className="tnum mt-4 rounded-[12px] border border-border bg-bg px-4 py-3 text-[14px]" role="status">
            <p>
              เผยแพร่คลิปที่ถึงเวลา <b className="font-semibold">{result.published.length}</b> รายการ
            </p>
            <p>
              ส่งแจ้งเตือนสมาชิกใกล้หมดอายุ <b className="font-semibold">{result.reminded}</b> คน
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
