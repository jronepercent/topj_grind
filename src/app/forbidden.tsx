import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "ไม่มีสิทธิ์เข้าถึง" };

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col bg-bg px-4 sm:px-6">
      <header className="flex h-14 items-center">
        <Logo />
      </header>
      <div className="tg-page mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center pb-24 text-center">
        <span className="flex size-16 items-center justify-center rounded-[20px] border border-border bg-surface">
          <ShieldAlert className="size-7 text-text-2" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="t-caption tnum mt-6 font-semibold tracking-[0.2em] text-text-2">403</p>
        <h1 className="t-h1 mt-2">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="t-meta mt-3">
          หน้านี้สำหรับผู้ดูแลช่องเท่านั้น หากคุณเป็นผู้ดูแล ลองเข้าสู่ระบบด้วยบัญชีผู้ดูแลอีกครั้ง
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="inverse" size="lg">
            <Link href="/">กลับหน้าแรก</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/login?next=/studio">เข้าสู่ระบบ</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
