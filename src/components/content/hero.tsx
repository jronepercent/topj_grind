"use client";
import * as React from "react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { Clock, ExternalLink, Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberBadge } from "@/components/ui/misc";
import { useOptionalViewer } from "@/components/providers";
import { saveForLater } from "@/components/cards/content-menu";
import { formatLongDuration, TYPE_LABEL } from "@/lib/format";
import type { HeroSlide } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Apple TV–style featured hero. Rotates every 7s, pauses on hover.
 * Layout follows the hero's own width (container queries) so the Studio preview matches phones and desktops.
 * `device` forces one image set and makes the buttons inert — used by the Studio preview only.
 */
export function Hero({ items, device, className }: { items: HeroSlide[]; device?: "mobile" | "desktop"; className?: string }) {
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const n = items.length;

  React.useEffect(() => {
    if (paused || n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(t);
  }, [paused, n]);
  React.useEffect(() => {
    if (i >= n) setI(0);
  }, [i, n]);

  if (!n) return null;
  const c = items[Math.min(i, n - 1)];

  return (
    <section
      className={cn("@container relative w-full overflow-hidden bg-black", className ?? "h-[56vh] min-h-[380px] max-h-[640px]")}
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
          <SlideImage slide={it} first={idx === 0} device={device} />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" aria-hidden />

      <div className="absolute inset-x-0 bottom-0 px-4 pb-10 @min-[640px]:px-6 @min-[1024px]:px-10">
        <SlideText key={c.id + "-text"} slide={c} inert={!!device} />
      </div>

      {n > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-1.5 @min-[640px]:right-6 @min-[1024px]:right-10" role="tablist">
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

/** Desktop image, or the phone image under 640px when the slide has one (art direction via <picture>). */
function SlideImage({ slide, first, device }: { slide: HeroSlide; first: boolean; device?: "mobile" | "desktop" }) {
  const desktop = slide.image ?? slide.mobile_image;
  const mobile = slide.mobile_image ?? desktop;
  if (!desktop || !mobile) return null;
  const common = { alt: "", fill: true, sizes: "100vw", priority: first && !device, className: "object-cover" } as const;
  if (device) {
    const { props } = getImageProps({ ...common, src: device === "mobile" ? mobile : desktop });
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  }
  const { props } = getImageProps({ ...common, src: desktop });
  if (mobile === desktop) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} loading={first ? undefined : "lazy"} />;
  }
  const { srcSet: mobileSet } = getImageProps({ ...common, src: mobile }).props;
  return (
    <picture>
      <source media="(max-width: 639px)" srcSet={mobileSet} sizes="100vw" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} loading={first ? undefined : "lazy"} />
    </picture>
  );
}

function SlideText({ slide: c, inert }: { slide: HeroSlide; inert: boolean }) {
  const ctx = useOptionalViewer();
  const clip = c.content;
  const locked = !!clip && clip.visibility === "members" && !!ctx && !ctx.viewer?.is_member;
  const icon = c.external ? <ExternalLink className="size-5" /> : locked ? <Lock className="size-5" /> : <Play className="size-5 fill-current" />;

  return (
    <div className="tg-page max-w-2xl text-white">
      {clip && (
        <div className="mb-3 flex items-center gap-2 text-[13px] text-white/80">
          <span className="font-semibold uppercase tracking-wider text-white">{TYPE_LABEL[clip.type]}</span>
          <span>·</span>
          <span className="tnum">{formatLongDuration(clip.duration_sec)}</span>
          {clip.visibility === "members" && <MemberBadge locked={locked} className="bg-black/50 text-[#E8C77A]" />}
        </div>
      )}
      <h1 className="text-balance text-[30px] font-semibold leading-[36px] tracking-[-0.02em] @min-[640px]:text-[40px] @min-[640px]:leading-[48px]">{c.title}</h1>
      {c.subtitle && <p className="mt-3 line-clamp-2 text-[15px] text-white/80 @min-[640px]:line-clamp-1">{c.subtitle}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {inert ? (
          <Button size="lg" className="pointer-events-none bg-white text-black" tabIndex={-1}>
            {icon}
            {c.cta_label}
          </Button>
        ) : (
          <Button asChild size="lg" className="bg-white text-black hover:bg-white/90">
            {c.external ? (
              <a href={c.href} target="_blank" rel="noopener noreferrer">
                {icon}
                {c.cta_label}
              </a>
            ) : (
              <Link href={c.href}>
                {icon}
                {c.cta_label}
              </Link>
            )}
          </Button>
        )}
        {clip && (
          <Button
            size="lg"
            className={cn("bg-white/15 text-white backdrop-blur hover:bg-white/25", inert && "pointer-events-none")}
            tabIndex={inert ? -1 : undefined}
            onClick={() => !inert && ctx?.requireAuth("เข้าสู่ระบบเพื่อบันทึกไว้ดูภายหลัง") && saveForLater(clip.id)}
          >
            <Clock className="size-5" /> ดูภายหลัง
          </Button>
        )}
      </div>
    </div>
  );
}
