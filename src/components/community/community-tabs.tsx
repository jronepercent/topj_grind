"use client";
import { PillTabs } from "@/components/ui/pill-tabs";

const TABS = [
  // "ชุมชน" also covers /community/posts/…; "บทความ" covers /community/articles/…
  { href: "/community", label: "ชุมชน", match: (p: string) => !p.startsWith("/community/articles") },
  { href: "/community/articles", label: "บทความ", match: (p: string) => p.startsWith("/community/articles") },
];

/** Pill tabs at the top of every /community page. */
export function CommunityTabs() {
  return (
    <div className="glass sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 border-b border-border">
      <div className="mx-auto max-w-[680px] px-4 py-2.5">
        <PillTabs tabs={TABS} label="ส่วนของชุมชน" className="justify-center" />
      </div>
    </div>
  );
}
