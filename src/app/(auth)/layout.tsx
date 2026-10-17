import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Minimal, centered auth shell — deliberately outside the site chrome. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="tg-page flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="t-caption flex justify-center gap-4 px-4 pb-6 text-text-2">
        <Link href="/" className="rounded-md hover:text-text">
          กลับหน้าแรก
        </Link>
        <span aria-hidden>·</span>
        <Link href="/about" className="rounded-md hover:text-text">
          เกี่ยวกับช่อง
        </Link>
      </footer>
    </div>
  );
}
