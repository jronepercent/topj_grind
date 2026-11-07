"use client";
import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { PROOF_TESTIMONIALS, VIDEO_TESTIMONIALS, type VideoTestimonial } from "@/lib/testimonials";
import { cn } from "@/lib/utils";

/**
 * "ผลลัพธ์จากคนที่เรียนกับ JR" on /membership: 4 unscripted video reviews + 10 DM screenshots.
 * Videos show a poster until tapped, so the page never downloads MP4 bytes on load,
 * and only one video is mounted at a time.
 */
export function Testimonials({ className }: { className?: string }) {
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <section className={cn("mx-auto max-w-[1100px]", className)} aria-labelledby="results-h">
      <div className="text-center">
        <p className="text-[14px] font-semibold text-member">เคสจริง ไม่มีสคริปต์</p>
        <h2 id="results-h" className="t-h1 mt-2">
          ผลลัพธ์จากคนที่เรียนกับ JR
        </h2>
        <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-[24px] text-text-2">
          คลิปรีวิวและข้อความจริงจากนักเรียนคอร์ส One Man Business ตั้งแต่เงินหมื่นแรก จนถึงหลักล้านต่อเดือน
        </p>
      </div>

      {/* Swipeable row on phones so 4 stacked cards don't push the prices a whole screen further down. */}
      <ul className="no-scrollbar -mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0">
        {VIDEO_TESTIMONIALS.map((t) => (
          <li key={t.id} className="w-[84vw] max-w-[420px] shrink-0 snap-start overflow-hidden rounded-[16px] border border-border bg-surface md:w-auto md:max-w-none">
            <VideoCase t={t} active={playing === t.id} onPlay={() => setPlaying(t.id)} />
            <div className="p-4 sm:p-5">
              <p className="tnum text-[13px] font-semibold text-member">{t.result}</p>
              <h3 className="mt-1 text-balance text-[17px] font-semibold leading-[24px]">{t.headline}</h3>
              <p className="mt-2 text-[14px] leading-[22px] text-text-2">{t.story}</p>
              <p className="t-meta mt-3">
                <span className="font-medium text-text">{t.name}</span> · {t.role}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="t-h2 mt-12 text-center">ข้อความจริง จากนักเรียนจริง</h3>
      <p className="t-meta mt-1 text-center">แคปจากแชตตรงๆ แตะเพื่อดูภาพเต็ม</p>
      <ul className="no-scrollbar -mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {PROOF_TESTIMONIALS.map((p) => (
          <li key={p.id} className="w-[62vw] shrink-0 snap-start sm:w-[220px]">
            <Dialog>
              <DialogTrigger className="group block w-full rounded-[12px] text-left">
                <span className="relative block aspect-[4/5] overflow-hidden rounded-[12px] border border-border bg-surface">
                  <Image
                    src={p.image}
                    alt={`แชตจากนักเรียน: ${p.quote}`}
                    fill
                    sizes="(max-width:640px) 62vw, 220px"
                    className="object-cover object-top transition-transform duration-150 group-hover:scale-[1.02]"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                    {p.tag}
                  </span>
                </span>
                <span className="mt-2 line-clamp-2 block text-[14px] font-medium leading-5">“{p.quote}”</span>
                <span className="t-meta mt-0.5 block">นักเรียน · {p.who}</span>
              </DialogTrigger>
              <DialogContent className="max-w-[460px] p-3 pt-12">
                <DialogTitle className="sr-only">{p.quote}</DialogTitle>
                <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-[12px]">
                  <Image src={p.image} alt={`แชตจากนักเรียน: ${p.quote}`} fill sizes="(max-width:500px) 100vw, 460px" quality={85} loading="eager" className="object-contain" />
                </span>
              </DialogContent>
            </Dialog>
          </li>
        ))}
      </ul>

      <p className="t-caption mx-auto mt-6 max-w-[640px] text-center text-text-2">
        ผลลัพธ์ข้างบนมาจากนักเรียนคอร์ส One Man Business ของ JR และขึ้นอยู่กับการลงมือทำของแต่ละคน ไม่ใช่การรับประกันรายได้
      </p>
    </section>
  );
}

function VideoCase({ t, active, onPlay }: { t: VideoTestimonial; active: boolean; onPlay: () => void }) {
  if (active) {
    return (
      <video
        src={t.video}
        poster={t.poster}
        controls
        autoPlay
        playsInline
        preload="auto"
        className="aspect-video w-full bg-black"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        onPlay();
        track("testimonial_played", { case: t.id });
      }}
      className="group relative block aspect-video w-full overflow-hidden bg-black"
      aria-label={`เล่นคลิปรีวิวของ${t.name}`}
    >
      <Image src={t.poster} alt="" fill sizes="(max-width:768px) 100vw, 540px" className="object-cover opacity-90 transition-opacity group-hover:opacity-100" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-member text-on-member shadow-lg transition-transform duration-150 group-hover:scale-105">
          <Play className="ml-1 size-7 fill-current" strokeWidth={0} aria-hidden />
        </span>
      </span>
    </button>
  );
}
