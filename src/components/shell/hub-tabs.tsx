import Link from "next/link";
import { pillClass } from "@/components/ui/pill-class";

const TABS = [
  { key: "mine", href: "/library", label: "ของฉัน" },
  { key: "owned", href: "/owned", label: "สินค้าของฉัน" },
  { key: "shop", href: "/shop", label: "ร้านค้า" },
  { key: "free", href: "/free", label: "ของฟรี" },
] as const;

export type HubTab = (typeof TABS)[number]["key"];

/**
 * Level-1 bar of the "คลัง" hub: ของฉัน · สินค้าของฉัน · ร้านค้า · ของฟรี. Server component (no client JS); the page passes
 * which one is active. "สินค้าของฉัน" sits right after ของฉัน so what people bought or took for free is never buried.
 */
export function HubTabs({ active }: { active: HubTab }) {
  return (
    <div className="glass sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 border-b border-transparent px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <nav aria-label="คลัง" className="no-scrollbar flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} aria-current={active === t.key ? "page" : undefined} className={pillClass(active === t.key)}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
