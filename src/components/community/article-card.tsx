import Image from "next/image";
import Link from "next/link";
import { BookOpen, Pin } from "lucide-react";
import { MemberBadge } from "@/components/ui/misc";
import type { ArticleView } from "@/lib/community";
import { thaiDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Article tile: cover, title, excerpt, date · read time. Members-only articles carry the lock badge. */
export function ArticleCard({ a, locked, variant = "row", className }: { a: ArticleView; locked: boolean; variant?: "row" | "tile"; className?: string }) {
  const href = `/community/articles/${a.id}`;
  const cover = (
    <div className={cn("relative aspect-video overflow-hidden rounded-[12px] bg-elevated", variant === "row" ? "sm:w-60 sm:shrink-0" : "w-full")}>
      {a.cover_url ? (
        <Image src={a.cover_url} alt="" fill sizes={variant === "row" ? "(max-width:640px) 100vw, 240px" : "(max-width:640px) 70vw, 320px"} className="object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-text-2">
          <BookOpen className="size-8" strokeWidth={1.5} aria-hidden />
        </div>
      )}
      {a.visibility === "members" && <MemberBadge locked={locked} className="absolute left-2 top-2" />}
    </div>
  );
  return (
    <article className={cn(variant === "row" ? "flex flex-col gap-4 sm:flex-row" : "flex flex-col gap-3", className)}>
      <Link href={href} tabIndex={-1} aria-hidden className="block">
        {cover}
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href}>
          <h3 className={cn("text-balance font-semibold leading-[1.45] hover:underline", variant === "row" ? "text-[19px]" : "line-clamp-2 text-[16px]")}>{a.title}</h3>
        </Link>
        {a.excerpt && <p className={cn("mt-1.5 text-text-2", variant === "row" ? "line-clamp-3 text-[15px] leading-[24px]" : "line-clamp-2 text-[14px] leading-[22px]")}>{a.excerpt}</p>}
        <p className="t-meta tnum mt-2 flex flex-wrap items-center gap-x-2">
          {a.is_pinned && (
            <span className="inline-flex items-center gap-1 font-medium text-text">
              <Pin className="size-3" aria-hidden /> ปักหมุด
            </span>
          )}
          <span>{thaiDate(a.published_at)}</span>
          <span aria-hidden>·</span>
          <span>อ่าน {a.read_min} นาที</span>
        </p>
      </div>
    </article>
  );
}
