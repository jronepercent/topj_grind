"use client";
import * as React from "react";
import { Check, Lock, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/misc";
import { StudioThumb } from "./ui";
import { TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";
import type { PickItem } from "./types";

function norm(s: string) {
  return s.toLowerCase().normalize("NFC");
}

/** Searchable list over all content. Selected items are shown with a check and can't be added twice. */
export function ContentPickerList({
  items,
  selected,
  onAdd,
  disabled,
  types,
  autoFocus,
}: {
  items: PickItem[];
  selected: string[];
  onAdd: (id: string) => void;
  disabled?: boolean;
  types?: ContentType[];
  autoFocus?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<ContentType | "all">("all");
  const list = items.filter(
    (it) =>
      (!types || types.includes(it.type)) &&
      (type === "all" || it.type === type) &&
      (!q.trim() || norm(it.title).includes(norm(q.trim()))),
  );
  const typeOptions = (types ?? (["video", "short", "podcast"] as ContentType[]));
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-2" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาคอนเทนต์"
          aria-label="ค้นหาคอนเทนต์"
          className={cn(inputClass, "pl-10")}
          autoFocus={autoFocus}
        />
      </div>
      {typeOptions.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto" role="group" aria-label="กรองประเภท">
          {(["all", ...typeOptions] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
                type === t ? "bg-text text-bg" : "bg-hover text-text-2 hover:text-text",
              )}
            >
              {t === "all" ? "ทั้งหมด" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-3 max-h-[46vh] space-y-0.5 overflow-y-auto pr-1">
        {list.length === 0 && <li className="t-meta px-2 py-8 text-center">ไม่พบคอนเทนต์ที่ตรงกับคำค้น</li>}
        {list.map((it) => {
          const isSel = selected.includes(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                disabled={isSel || disabled}
                onClick={() => onAdd(it.id)}
                className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
                aria-label={isSel ? `${it.title} (เลือกแล้ว)` : `เพิ่ม ${it.title}`}
              >
                <StudioThumb src={it.thumbnail_url} type={it.type} duration={it.duration_sec} className="w-20" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[14px] font-medium leading-5">{it.title}</span>
                  <span className="t-caption mt-0.5 flex items-center gap-1.5 text-text-2">
                    {TYPE_LABEL[it.type]}
                    {it.visibility === "members" && <Lock className="size-3 text-member" aria-label="เฉพาะสมาชิก" />}
                    {!it.live && <span>· ยังไม่เผยแพร่</span>}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    isSel ? "text-success" : "bg-hover text-text",
                  )}
                  aria-hidden
                >
                  {isSel ? <Check className="size-4" /> : <Plus className="size-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ContentPickerDialog({
  open,
  onOpenChange,
  title = "เพิ่มคอนเทนต์",
  hint,
  ...rest
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  hint?: string;
} & React.ComponentProps<typeof ContentPickerList>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{title}</DialogTitle>
        {hint && <p className="t-meta mt-1">{hint}</p>}
        <div className="mt-4">
          <ContentPickerList {...rest} autoFocus />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="inverse" onClick={() => onOpenChange(false)}>
            เสร็จ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
