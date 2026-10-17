"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Clock, Search, X } from "lucide-react";
import { suggestAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { TYPE_LABEL } from "@/lib/format";

const RECENT_KEY = "tg_recent_searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushRecent(q: string) {
  try {
    const list = [q, ...readRecent().filter((x) => x !== q)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}

export function SearchBox({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [open, setOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [sugg, setSugg] = React.useState<{ id: string; type: keyof typeof TYPE_LABEL; title: string }[]>([]);
  const [active, setActive] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // "/" focuses search
  React.useEffect(() => {
    if (mobile) {
      inputRef.current?.focus();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile]);

  // debounce 200ms
  React.useEffect(() => {
    if (!q.trim()) {
      setSugg([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await suggestAction(q);
      if (r.ok) setSugg(r.data);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const items: { label: string; recent?: boolean; href?: string }[] = q.trim()
    ? sugg.map((s) => ({ label: s.title, href: undefined }))
    : recent.map((r) => ({ label: r, recent: true }));

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    pushRecent(t);
    setOpen(false);
    inputRef.current?.blur();
    onClose?.();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 && items[active] ? items[active].label : q);
      }}
    >
      <div className="flex items-center gap-2">
        {mobile && (
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-hover" aria-label="ปิดการค้นหา">
            <ArrowLeft className="size-5" strokeWidth={1.75} />
          </button>
        )}
        <div className="relative flex h-10 flex-1 items-center rounded-full border border-border bg-surface transition-colors focus-within:border-[var(--border-strong)] focus-within:bg-elevated">
          <Search className="ml-4 size-[18px] shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => {
              setRecent(readRecent());
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              } else if (e.key === "Escape") {
                inputRef.current?.blur();
              }
            }}
            placeholder="ค้นหา"
            aria-label="ค้นหา"
            aria-autocomplete="list"
            aria-expanded={open && items.length > 0}
            className="h-full flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-text-2"
            enterKeyHint="search"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              className="mr-1 rounded-full p-1.5 text-text-2 hover:bg-hover"
              aria-label="ล้างคำค้นหา"
            >
              <X className="size-4" />
            </button>
          )}
          {!mobile && !q && (
            <kbd className="mr-3 hidden rounded-md border border-border px-1.5 text-[11px] text-text-2 md:inline">/</kbd>
          )}
        </div>
      </div>

      {open && items.length > 0 && (
        <ul
          role="listbox"
          className={cn(
            "tg-drop absolute z-50 mt-2 overflow-hidden rounded-[16px] border border-border bg-elevated py-2 shadow-2xl",
            mobile ? "left-0 right-0" : "left-0 right-0",
          )}
        >
          {items.map((it, i) => (
            <li key={it.label + i} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(it.label)}
                className={cn("flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] hover:bg-hover", i === active && "bg-hover")}
              >
                {it.recent ? <Clock className="size-4 shrink-0 text-text-2" /> : <Search className="size-4 shrink-0 text-text-2" />}
                <span className="truncate">{it.label}</span>
                {!it.recent && sugg[i] && <span className="t-caption ml-auto shrink-0 text-text-2">{TYPE_LABEL[sugg[i].type]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
