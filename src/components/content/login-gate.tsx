"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Lock } from "lucide-react";
import { googleSignInAction } from "@/app/(auth)/auth-actions";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";

/** Current path + query, sent as `next` so the visitor lands back on the same clip after signing in. */
function useNext() {
  const pathname = usePathname();
  const qs = useSearchParams()?.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GoogleButton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#E8C77A] font-semibold text-[#1d1606] transition hover:brightness-105 disabled:opacity-70",
        compact ? "h-9 px-4 text-[13px]" : "h-11 px-5 text-[15px] sm:h-12",
      )}
    >
      <span className={cn("flex items-center justify-center rounded-full bg-white", compact ? "size-5 [&_svg]:size-3.5" : "size-6 [&_svg]:size-4")}>
        <GoogleLogo />
      </span>
      {pending ? "กำลังไปที่ Google…" : "ล็อกอินด้วย Google"}
    </button>
  );
}

/**
 * Lead-capture gate for "free" content: guests watch a teaser, then sign in (free) to continue.
 * "player" = overlay over a blurred poster (fills its positioned parent); "compact" = small card for the mini player.
 */
export function LoginGate({ variant, thumb, next: nextProp, className, contentId }: { variant: "player" | "compact"; contentId?: string; thumb?: string | null; /** where to return after sign-in (default: the current URL) */ next?: string; className?: string }) {
  const here = useNext();
  const next = nextProp ?? here;
  const q = encodeURIComponent(next);
  const compact = variant === "compact";
  React.useEffect(() => {
    track("login_gate_shown", { content_id: contentId });
  }, [contentId]);

  const card = (
    // On phones the 16:9 player is only ~210px tall: drop the icon and sub-text there, keep title + buttons.
    <div className={cn("relative w-full text-center text-[#F5F5F7]", compact ? "max-w-[300px]" : "max-w-[380px] sm:rounded-[20px] sm:border sm:border-white/10 sm:bg-[#141416]/85 sm:p-7 sm:backdrop-blur-xl", className)}>
      {!compact && (
        <span className="mx-auto hidden size-12 items-center justify-center rounded-full bg-[#E8C77A]/15 sm:flex">
          <Lock className="size-6 text-[#E8C77A]" strokeWidth={1.75} />
        </span>
      )}
      <h2 className={cn("text-balance font-semibold", compact ? "text-[15px]" : "text-[18px] sm:mt-4 sm:text-[22px]")}>ดูต่อฟรี แค่ล็อกอิน</h2>
      {!compact && (
        <p className="mt-2 hidden text-[14px] leading-[22px] text-[#A1A1A6] sm:block">
          คลิปนี้ฟรีสำหรับคนที่มีบัญชี TOPJ_GRIND สมัครไม่ถึง 10 วินาที ไม่ต้องใช้บัตร
        </p>
      )}
      <form action={googleSignInAction} className={compact ? "mt-2" : "mt-3 sm:mt-5"}>
        <input type="hidden" name="next" value={next} />
        <GoogleButton compact={compact} />
      </form>
      <div className={cn("flex items-center justify-center", compact ? "mt-1.5 flex-col gap-0.5" : "mt-3 flex-row gap-4 sm:flex-col sm:gap-2")}>
        <Link
          href={`/signup?next=${q}`}
          className={cn("font-medium text-[#F5F5F7] underline-offset-4 hover:underline", compact ? "text-[12px]" : "text-[14px]")}
        >
          ใช้อีเมลแทน
        </Link>
        <Link href={`/login?next=${q}`} className={cn("text-[#A1A1A6] underline-offset-4 hover:underline", compact ? "text-[11px]" : "text-[13px]")}>
          มีบัญชีแล้ว? เข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-[8] flex items-center justify-center overflow-hidden bg-black p-3 sm:p-4">
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" aria-hidden />
      )}
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      {card}
    </div>
  );
}
