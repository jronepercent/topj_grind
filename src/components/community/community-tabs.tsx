"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/community", label: "ชุมชน" },
  { href: "/community/articles", label: "บทความ" },
] as const;

/** Segmented toggle at the top of every /community page. */
export function CommunityTabs() {
  const pathname = usePathname();
  const onArticles = pathname.startsWith("/community/articles");
  return (
    <div className="glass sticky top-14 z-30 border-b border-border">
      <div className="mx-auto flex max-w-[680px] justify-center px-4 py-2.5">
        <nav aria-label="ส่วนของชุมชน" className="grid w-full max-w-[360px] grid-cols-2 rounded-full bg-hover p-1">
          {TABS.map((t) => {
            const active = t.href === "/community" ? !onArticles : onArticles;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full py-1.5 text-center text-[14px] font-medium transition-colors",
                  active ? "bg-text text-bg shadow-sm" : "text-text-2 hover:text-text",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
