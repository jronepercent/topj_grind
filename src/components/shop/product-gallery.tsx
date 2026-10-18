"use client";
import * as React from "react";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Product images: a swipeable strip (CSS scroll-snap, so touch swipe works natively) with thumbnails underneath.
 * Thumbnails are real buttons; the active one has aria-current. Arrow keys move between images.
 */
export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const strip = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);

  const onScroll = () => {
    const el = strip.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.max(0, Math.min(images.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const goTo = (i: number) => {
    const el = strip.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setIndex(i);
  };

  if (!images.length) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[20px] border border-border bg-surface text-text-2" role="img" aria-label={title}>
        <ShoppingBag className="size-12" strokeWidth={1.25} aria-hidden />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="relative">
        <div
          ref={strip}
          onScroll={onScroll}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[20px] border border-border bg-surface"
          role="group"
          aria-roledescription="carousel"
          aria-label={`รูปสินค้า ${title}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") goTo(Math.min(images.length - 1, index + 1));
            if (e.key === "ArrowLeft") goTo(Math.max(0, index - 1));
          }}
        >
          {images.map((src, i) => (
            <div key={src} className="relative aspect-[4/5] w-full shrink-0 snap-center" role="group" aria-roledescription="slide" aria-label={`รูปที่ ${i + 1} จาก ${images.length}`}>
              <Image src={src} alt={i === 0 ? title : ""} fill priority={i === 0} sizes="(max-width:1024px) 100vw, 520px" className="object-cover" />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <span className="tnum pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur lg:hidden" aria-hidden>
            {index + 1}/{images.length}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <ul className="no-scrollbar mt-3 hidden gap-2 overflow-x-auto lg:flex" aria-label="เลือกรูป">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`ดูรูปที่ ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-[10px] border-2 bg-surface transition-colors",
                  i === index ? "border-text" : "border-transparent opacity-70 hover:opacity-100",
                )}
              >
                <Image src={src} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {images.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
          {images.map((_, i) => (
            <span key={i} className={cn("size-1.5 rounded-full transition-colors", i === index ? "bg-text" : "bg-text-2/40")} />
          ))}
        </div>
      )}
    </div>
  );
}
