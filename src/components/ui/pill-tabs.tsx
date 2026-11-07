"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chipClass, pillClass } from "./pill-class";

export { chipClass, pillClass };

export interface PillTab {
  href: string;
  label: string;
  /** Small number after the label. Hidden when undefined. */
  count?: number;
  /** Custom active test (default: exact pathname match), e.g. keep "ชุมชน" active on /community/posts/… */
  match?: (path: string) => boolean;
}

/** Route-based tabs (one page per tab). */
/** `variant="chip"` is the smaller bordered level-2 look (see chipClass). */
export function PillTabs({ tabs, label, className, variant = "pill" }: { tabs: PillTab[]; label: string; className?: string; variant?: "pill" | "chip" }) {
  const path = usePathname();
  const navRef = React.useRef<HTMLElement>(null);
  // On phones the row scrolls sideways: keep the current tab in view.
  React.useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el) return;
    const left = el.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + el.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, left - 16) });
  }, [path]);
  return (
    <nav ref={navRef} aria-label={label} className={cn("no-scrollbar flex gap-2 overflow-x-auto", className)}>
      {tabs.map((t) => {
        const on = t.match ? t.match(path) : path === t.href;
        return (
          <Link key={t.href} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={(variant === "chip" ? chipClass : pillClass)(on)}>
            {t.label}
            {t.count !== undefined && <span className={cn("tnum text-[12px]", on ? "opacity-70" : "text-text-2")}>{formatNumber(t.count)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
