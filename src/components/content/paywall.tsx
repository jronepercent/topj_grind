"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Where the subscribe button should go: the plans page for everyone. Guests create an account there, after picking a plan. */
export function useSubscribeHref() {
  const pathname = usePathname();
  return `/membership?from=${encodeURIComponent(pathname)}`;
}

export function Paywall({
  variant,
  thumb,
  onClose,
  className,
}: {
  variant: "modal" | "player" | "inline";
  thumb?: string | null;
  onClose?: () => void;
  className?: string;
}) {
  const { settings } = useViewer();
  const href = useSubscribeHref();

  const card = (
    <div
      className={cn(
        "relative w-full max-w-[400px] rounded-[20px] p-6 text-center sm:p-7",
        variant === "modal" ? "" : "border border-white/10 bg-[#141416]/85 text-[#F5F5F7] backdrop-blur-xl",
        className,
      )}
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#E8C77A]/15">
        <Lock className="size-6 text-[#E8C77A]" strokeWidth={1.75} />
      </span>
      <h2 className="t-h2 mt-4 text-balance">{settings.paywall_title}</h2>
      <ul className={cn("mx-auto mt-4 max-w-[300px] space-y-2 text-left text-[14px]", variant === "modal" ? "" : "text-[#F5F5F7]/90")}>
        {settings.paywall_benefits.map((b) => (
          <li key={b} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-[#E8C77A]" strokeWidth={2.25} />
            {b}
          </li>
        ))}
      </ul>
      <p className={cn("tnum mt-5 text-[15px] leading-[24px]", variant === "modal" ? "text-text-2" : "text-[#A1A1A6]")}>
        เริ่มต้น{" "}
        <span className={cn("text-[22px] font-semibold tracking-[-0.01em]", variant === "modal" ? "text-text" : "text-[#F5F5F7]")}>
          {formatNumber(PLANS.monthly.price)} บาท/{PLANS.monthly.unit}
        </span>
        <br />
        หรือ {formatNumber(PLANS.yearly.price)} บาท/{PLANS.yearly.unit}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button asChild size="lg" className="bg-[#E8C77A] text-[#1d1606] hover:brightness-105" onClick={onClose}>
          <Link href={href}>ดูแพ็กเกจและสมัคร</Link>
        </Button>
        <Button
          asChild
          variant="ghost"
          size="lg"
          className={variant === "modal" ? "" : "text-[#F5F5F7] hover:bg-white/10"}
          onClick={onClose}
        >
          <Link href="/?filter=free">ดูคลิปฟรีก่อน</Link>
        </Button>
      </div>
    </div>
  );

  if (variant !== "player") return card;

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black p-4">
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" aria-hidden />
      )}
      <div className="absolute inset-0 bg-black/40" aria-hidden />
      {card}
    </div>
  );
}
