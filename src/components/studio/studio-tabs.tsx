"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StudioTab {
  href: string;
  label: string;
  /** Small number after the label (e.g. people to follow up). Hidden when undefined. */
  count?: number;
  /** Count in the brand accent (needs attention). */
  alert?: boolean;
  /** Also active on deeper paths (e.g. /studio/shop for /studio/shop/123/edit). Default: exact match only. */
  prefix?: boolean;
}

/**
 * Section tabs for a Studio area: one page per tab, pill style (active = solid light pill).
 * Put it right under the PageHeader, usually from the area's layout.tsx so it stays while switching pages.
 */
export function StudioTabs({ tabs, label }: { tabs: StudioTab[]; label: string }) {
  const path = usePathname();
  const navRef = React.useRef<HTMLElement>(null);
  const active = (t: StudioTab) => path === t.href || (!!t.prefix && path.startsWith(t.href + "/"));
  // On phones the row scrolls sideways: keep the current tab in view.
  React.useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el) return;
    const left = el.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + el.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollTo({ left: Math.max(0, left - 16) });
  }, [path]);
  return (
    <nav ref={navRef} aria-label={label} className="no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const on = active(t);
        return (
          <Link
            key={t.href}
            href={t.href}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
              on ? "bg-text text-bg" : "bg-elevated text-text hover:bg-hover",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("tnum text-[12px]", on ? "opacity-70" : t.alert && t.count > 0 ? "font-semibold text-accent" : "text-text-2")}>
                {formatNumber(t.count)}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
