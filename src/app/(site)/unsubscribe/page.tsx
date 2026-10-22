import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verifyUnsubscribeToken } from "@/lib/server/email";
import { unsubscribeAction } from "./actions";

export const metadata: Metadata = {
  title: "ยกเลิกรับอีเมลแจ้งเตือน",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ u?: string; t?: string; done?: string; error?: string }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const { u = "", t = "", done, error } = await searchParams;

  let title: string;
  let body: string;
  let action: React.ReactNode = null;
  if (done) {
    title = "ยกเลิกรับอีเมลแล้ว";
    body = "เราจะไม่ส่งอีเมลแจ้งคลิปหรือโพสต์ใหม่ให้คุณอีก (อีเมลเกี่ยวกับบัญชี เช่น ลืมรหัสผ่าน ยังส่งตามปกติ) เปลี่ยนใจเมื่อไรก็เปิดกลับได้ที่หน้าบัญชีของฉัน";
    action = (
      <Button asChild variant="outline">
        <Link href="/account">ไปหน้าบัญชีของฉัน</Link>
      </Button>
    );
  } else if (error || !verifyUnsubscribeToken(u, t)) {
    title = "ลิงก์ไม่ถูกต้อง";
    body = "ลิงก์ยกเลิกนี้ใช้ไม่ได้ หรือเกิดข้อผิดพลาด ถ้าคุณเข้าสู่ระบบอยู่ ปิดการรับอีเมลได้เองที่หน้าบัญชีของฉัน";
    action = (
      <Button asChild variant="outline">
        <Link href="/account">ไปหน้าบัญชีของฉัน</Link>
      </Button>
    );
  } else {
    title = "ยกเลิกรับอีเมลแจ้งเตือน?";
    body = "เราจะหยุดส่งอีเมลแจ้งคลิปและโพสต์ใหม่ให้อีเมลนี้ อีเมลเกี่ยวกับบัญชี เช่น ลืมรหัสผ่าน ยังส่งตามปกติ";
    action = (
      <form action={unsubscribeAction}>
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="t" value={t} />
        <Button type="submit" variant="inverse" size="lg">
          ยืนยันยกเลิก
        </Button>
      </form>
    );
  }

  return (
    <div className="tg-page mx-auto flex max-w-[480px] flex-col items-center px-4 py-20 text-center sm:px-6">
      <h1 className="t-h1">{title}</h1>
      <p className="t-meta mt-3">{body}</p>
      <div className="mt-8">{action}</div>
    </div>
  );
}
