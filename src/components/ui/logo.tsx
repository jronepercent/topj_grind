import Link from "next/link";
import { cn } from "@/lib/utils";

/** Placeholder wordmark — swap for the real logo file later. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="TOPJ_GRIND หน้าแรก"
      className={cn("select-none whitespace-nowrap text-[19px] font-bold tracking-[-0.03em]", className)}
      style={{ fontFamily: "var(--font-inter)" }}
    >
      TOPJ<span className="text-accent">_</span>GRIND
    </Link>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[9px] bg-text font-bold tracking-[-0.04em] text-bg"
      style={{ width: size, height: size, fontSize: size * 0.42, fontFamily: "var(--font-inter)" }}
      aria-hidden
    >
      TG
    </span>
  );
}
