import Image from "next/image";
import Link from "next/link";
import { FileDown, Gift, Wrench } from "lucide-react";
import { FREEBIE_KIND_LABEL, freebieHref, type FreebiePublic } from "@/lib/freebies";
import { cn } from "@/lib/utils";

/**
 * ของฟรี card for the /free grid. No hooks and no "use client". Same 4:5 cover shape as the shop's ProductCard so the two
 * sections of /free line up, but the price line is a “ฟรี” tag instead.
 */
export function FreebieCard({ item, priority, className }: { item: Pick<FreebiePublic, "id" | "kind" | "title" | "subtitle" | "cover_url">; priority?: boolean; className?: string }) {
  const Icon = item.kind === "tool" ? Wrench : FileDown;
  return (
    <Link href={freebieHref(item.id)} className={cn("group block w-full min-w-0 rounded-[14px]", className)} aria-label={`${item.title} (ฟรี)`}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] border border-border bg-surface">
        {item.cover_url ? (
          <Image
            src={item.cover_url}
            alt=""
            fill
            priority={priority}
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-text-2" aria-hidden>
            <Gift className="size-8" strokeWidth={1.5} />
          </span>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold leading-4 text-white backdrop-blur">
          <Icon className="size-3" strokeWidth={2.25} aria-hidden /> {FREEBIE_KIND_LABEL[item.kind]}
        </span>
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[14px] font-semibold leading-[20px] sm:text-[15px] sm:leading-[21px]">{item.title}</h3>
      {item.subtitle && <p className="t-meta mt-0.5 line-clamp-1">{item.subtitle}</p>}
      <p className="mt-1.5 text-[15px] font-semibold text-accent">ฟรี</p>
    </Link>
  );
}
