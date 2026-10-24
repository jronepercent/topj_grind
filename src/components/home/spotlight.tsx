import Image from "next/image";
import Link from "next/link";
import { BookOpen, Headphones, Play } from "lucide-react";
import { MemberBadge } from "@/components/ui/misc";
import type { MixedItem } from "@/lib/server/home";
import { contentHref, formatDuration, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** How many items the spotlight shows: one lead tile + four small ones. */
export const SPOTLIGHT_COUNT = 5;

/**
 * "ใหม่ล่าสุด" as a bento grid instead of a plain row: the newest item is a big tile (2×2 on desktop,
 * full width on phones), the next four sit beside it. Titles sit on the image so the block reads as
 * one piece and does not look like the rows below it.
 */
export function Spotlight({ title, href, items, locked }: { title: string; href?: string; items: MixedItem[]; locked: boolean }) {
  const shown = items.slice(0, SPOTLIGHT_COUNT);
  if (!shown.length) return null;
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-4 sm:mb-4">
        <h2 className="t-h2">
          {title}
        </h2>
        {href && (
          <Link href={href} className="shrink-0 text-[14px] font-medium text-text-2 hover:text-text">
            ดูทั้งหมด<span className="sr-only"> {title}</span>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {shown.map((m, i) => (
          <Tile key={m.kind === "content" ? m.c.id : `a-${m.a.id}`} m={m} lead={i === 0} locked={locked} />
        ))}
      </div>
    </section>
  );
}

function Tile({ m, lead, locked }: { m: MixedItem; lead: boolean; locked: boolean }) {
  const v =
    m.kind === "content"
      ? {
          href: contentHref(m.c),
          title: m.c.title,
          img: m.c.thumbnail_url,
          members: m.c.visibility === "members",
          kind: m.c.type === "podcast" ? "พอดแคสต์" : "วิดีโอ",
          Icon: m.c.type === "podcast" ? Headphones : Play,
          meta: [formatDuration(m.c.duration_sec), timeAgo(m.c.published_at)],
        }
      : {
          href: `/community/articles/${m.a.id}`,
          title: m.a.title,
          img: m.a.cover_url,
          members: m.a.visibility === "members",
          kind: "บทความ",
          Icon: BookOpen,
          meta: [`อ่าน ${m.a.read_min} นาที`, timeAgo(m.a.published_at)],
        };
  return (
    <Link
      href={v.href}
      className={cn(
        "group relative block aspect-video overflow-hidden rounded-[14px] bg-surface",
        lead && "col-span-2 lg:row-span-2 lg:aspect-auto",
      )}
    >
      {v.img ? (
        <Image
          src={v.img}
          alt=""
          fill
          priority={lead}
          sizes={lead ? "(max-width:1024px) 100vw, 50vw" : "(max-width:1024px) 50vw, 25vw"}
          className="object-cover transition-transform duration-300 ease-[var(--ease-apple)] group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-text-2">
          <v.Icon className="size-8" strokeWidth={1.5} aria-hidden />
        </div>
      )}
      <div
        className={cn("absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent", lead ? "via-35%" : "via-50%")}
        aria-hidden
      />
      <div className="absolute left-2 top-2 flex items-center gap-1.5 sm:left-3 sm:top-3">
        {lead && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold leading-4 text-on-accent">ใหม่</span>}
        {v.members && <MemberBadge locked={locked} className={!locked ? "bg-black/60 text-white backdrop-blur" : undefined} />}
      </div>
      <div className={cn("absolute inset-x-0 bottom-0", lead ? "p-4 sm:p-6" : "p-2.5 sm:p-3")}>
        <p className={cn("tnum flex items-center gap-1.5 font-medium text-white/75", lead ? "mb-2 text-[13px]" : "mb-1 text-[11px] sm:text-[12px]")}>
          <v.Icon className={lead ? "size-3.5" : "size-3"} aria-hidden />
          <span>{v.kind}</span>
          {v.meta.map((t) => (
            <span key={t} className={cn(!lead && t === v.meta[1] && "hidden sm:inline")}>
              <span aria-hidden>· </span>
              {t}
            </span>
          ))}
        </p>
        <h3
          className={cn(
            "text-balance font-semibold text-white",
            lead ? "line-clamp-2 text-[20px] leading-[1.35] sm:text-[28px] sm:font-bold" : "line-clamp-2 text-[13px] leading-[1.4] sm:text-[15px]",
          )}
        >
          {v.title}
        </h3>
      </div>
    </Link>
  );
}
