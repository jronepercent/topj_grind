"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PAY_FROM_KEY = "tg_pay_from";

/**
 * Pay / renew CTA. Remembers where the viewer came from so /membership/success
 * can send them back even after a round-trip through the external payment page.
 */
export function PayButton({
  href,
  from,
  external,
  children,
  className,
  variant = "member",
}: {
  href: string;
  from?: string;
  external?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: "member" | "outline";
}) {
  const remember = () => {
    try {
      if (from) sessionStorage.setItem(PAY_FROM_KEY, from);
      else sessionStorage.removeItem(PAY_FROM_KEY);
    } catch {}
  };
  return (
    <Button asChild variant={variant} size="lg" className={cn("min-w-[200px]", className)}>
      {external ? (
        <a href={href} onClick={remember} rel="noopener">
          {children}
        </a>
      ) : (
        <Link href={href} onClick={remember}>
          {children}
        </Link>
      )}
    </Button>
  );
}
