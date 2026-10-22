import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND_RED } from "@/lib/brand";

/** The banner wordmark: heavy "TOPJ GRIND" with J and R (JR) highlighted. Uses the site accent: banner red is too dark on the dark theme. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="TOPJ_GRIND หน้าแรก"
      className={cn("select-none whitespace-nowrap text-[19px] font-black uppercase tracking-[-0.02em]", className)}
      style={{ fontFamily: "var(--font-inter)" }}
    >
      TOP<span className="text-accent">J</span> G<span className="text-accent">R</span>IND
    </Link>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[9px] font-black tracking-[-0.04em]"
      style={{ width: size, height: size, fontSize: size * 0.42, fontFamily: "var(--font-inter)", background: BRAND_RED }}
      aria-hidden
    >
      <span className="text-[#0A0A0B]">T</span>
      <span className="text-white">G</span>
    </span>
  );
}
