import Link from "next/link";
import { Markdown } from "@/components/community/markdown";
import { thaiDate } from "@/lib/format";
import { LEGAL_LINKS, LEGAL_UPDATED } from "@/lib/legal";
import { siteSettings } from "@/lib/server/queries";

/** The LINE OA link from Studio settings, or the about page when none is set. */
export async function contactLink() {
  const line = (await siteSettings()).socials.find((x) => x.key === "line" && /^https?:\/\//i.test(x.url))?.url;
  return line ? `[LINE OA ของ TOPJ_GRIND](${line})` : "[ช่องทางติดต่อในหน้าเกี่ยวกับช่อง](/about)";
}

/** Shared frame for /terms, /privacy and /refund: title, last-updated date, body (Markdown), links to the other two. */
export function LegalPage({ path, title, body }: { path: string; title: string; body: string }) {
  return (
    <article className="tg-page mx-auto max-w-[720px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <h1 className="text-balance text-[30px] font-semibold leading-[1.35] tracking-[-0.015em] sm:text-[36px]">{title}</h1>
      <p className="t-meta mt-3">ปรับปรุงล่าสุด {thaiDate(LEGAL_UPDATED)}</p>
      <div className="mt-10 text-[16px] leading-[1.85]">
        <Markdown>{body}</Markdown>
      </div>
      <nav className="mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-[14px]" aria-label="นโยบายอื่น">
        {LEGAL_LINKS.filter((l) => l.href !== path).map((l) => (
          <Link key={l.href} href={l.href} className="text-text-2 underline-offset-4 hover:text-text hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </article>
  );
}
