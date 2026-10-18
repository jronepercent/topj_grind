"use client";
import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Instagram-style gallery: CSS scroll-snap (swipe on touch), dots, arrows on desktop.
 * Double-tap / double-click anywhere on the image calls onDoubleTap (like) and floats a heart.
 */
export function ImageCarousel({ images, onDoubleTap, priority }: { images: string[]; onDoubleTap?: () => void; priority?: boolean }) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const [burst, setBurst] = React.useState(0);
  const lastTap = React.useRef(0);
  const many = images.length > 1;
  // The frame takes the first image's own shape (never cropped). Very tall images stop at 4:5 like
  // Instagram and get side bars instead; later images keep the same frame and are fitted inside it.
  const [ratio, setRatio] = React.useState(4 / 5);
  const onFirstLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w && h) setRatio(Math.max(4 / 5, w / h));
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((cur) => (cur === i ? cur : i));
  };
  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(images.length - 1, i)) * el.clientWidth, behavior: "smooth" });
  };
  const like = () => {
    if (!onDoubleTap) return; // the post card handles double-tap itself
    onDoubleTap();
    setBurst((n) => n + 1);
  };

  return (
    <div className="group relative overflow-hidden bg-elevated">
      <div
        ref={scroller}
        onScroll={onScroll}
        onDoubleClick={like}
        onTouchEnd={() => {
          const now = Date.now();
          if (now - lastTap.current < 300) like();
          lastTap.current = now;
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        role="group"
        aria-roledescription="carousel"
        aria-label={`รูปภาพ ${images.length} รูป`}
      >
        {images.map((src, i) => (
          <div
            key={src}
            className="relative w-full shrink-0 snap-center"
            style={{ aspectRatio: ratio }}
            aria-label={`รูปที่ ${i + 1} จาก ${images.length}`}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              priority={priority && i === 0}
              draggable={false}
              onLoad={i === 0 ? onFirstLoad : undefined}
              className="select-none object-contain"
            />
          </div>
        ))}
      </div>

      {many && (
        <>
          <span className="tnum absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[12px] font-medium text-white backdrop-blur">
            {index + 1}/{images.length}
          </span>
          {index > 0 && (
            <button
              onClick={() => go(index - 1)}
              className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 sm:block"
              aria-label="รูปก่อนหน้า"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index < images.length - 1 && (
            <button
              onClick={() => go(index + 1)}
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 sm:block"
              aria-label="รูปถัดไป"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full transition-all", i === index ? "w-3 bg-white" : "bg-white/50")} />
            ))}
          </div>
        </>
      )}

      {burst > 0 && (
        <Heart
          key={burst}
          className="pointer-events-none absolute left-1/2 top-1/2 size-24 fill-white text-white drop-shadow-lg"
          style={{ animation: "floatHeart 900ms var(--ease-apple) forwards" }}
          aria-hidden
        />
      )}
    </div>
  );
}
