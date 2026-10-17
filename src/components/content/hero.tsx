"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberBadge } from "@/components/ui/misc";
import { useViewer } from "@/components/providers";
import { saveForLater } from "@/components/cards/content-menu";
import { contentHref, formatLongDuration, TYPE_LABEL } from "@/lib/format";
import type { Content } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Apple TV–style featured hero. Rotates every 7s, pauses on hover. */
export function Hero({ items }: { items: Content[] }) {
  const { viewer, requireAuth } = useViewer();
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const n = items.length;

  React.useEffect(() => {
    if (paused || n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(t);
  }, [paused, n]);

  if (!n) return null;
  const c = items[i];
  const locked = c.visibility === "members" && !viewer?.is_member;
  const firstLine = c.description.split("\n")[0];

  return (
    <section
      className="relative h-[56vh] min-h-[380px] max-h-[640px] w-full overflow-hidden bg-black"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="คอนเทนต์แนะนำ"
    >
      {/* All slides stacked; CSS crossfades between them. Only the first image is high priority. */}
      {items.map((it, idx) => (
        <div
          key={it.id}
          aria-hidden={idx !== i}
          className={cn(
            "absolute inset-0 transition-[opacity,transform] duration-700 ease-[var(--ease-apple)]",
            idx === i ? "scale-100 opacity-100" : "scale-[1.03] opacity-0",
          )}
        >
          {it.thumbnail_url && (
            <Image src={it.thumbnail_url} alt="" fill priority={idx === 0} loading={idx === 0 ? undefined : "lazy"} sizes="100vw" className="object-cover" />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" aria-hidden />

      <div className="absolute inset-x-0 bottom-0 px-4 pb-10 sm:px-6 lg:px-10">
        <div key={c.id + "-text"} className="tg-page max-w-2xl text-white">
          <div className="mb-3 flex items-center gap-2 text-[13px] text-white/80">
            <span className="font-semibold uppercase tracking-wider text-white">{TYPE_LABEL[c.type]}</span>
            <span>·</span>
            <span className="tnum">{formatLongDuration(c.duration_sec)}</span>
            {c.visibility === "members" && <MemberBadge locked={locked} className="bg-black/50 text-[#E8C77A]" />}
          </div>
          <h1 className="t-display text-balance">{c.title}</h1>
          <p className="mt-3 line-clamp-1 text-[15px] text-white/80">{firstLine}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-white text-black hover:bg-white/90">
              <Link href={contentHref(c)}>
                {locked ? <Lock className="size-5" /> : <Play className="size-5 fill-current" />}
                ดูเลย
              </Link>
            </Button>
            <Button
              size="lg"
              className="bg-white/15 text-white backdrop-blur hover:bg-white/25"
              onClick={() => requireAuth("เข้าสู่ระบบเพื่อบันทึกไว้ดูภายหลัง") && saveForLater(c.id)}
            >
              <Clock className="size-5" /> ดูภายหลัง
            </Button>
          </div>
        </div>
      </div>

      {n > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-1.5 sm:right-6 lg:right-10" role="tablist">
          {items.map((it, idx) => (
            <button
              key={it.id}
              role="tab"
              aria-selected={idx === i}
              aria-label={`รายการที่ ${idx + 1}`}
              onClick={() => setI(idx)}
              className={cn("h-1.5 rounded-full bg-white/40 transition-all duration-300", idx === i ? "w-6 bg-white" : "w-1.5 hover:bg-white/70")}
            />
          ))}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {c.title}
      </span>
    </section>
  );
}
