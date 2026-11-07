"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

/** "เข้าสู่ระบบ" that returns to the page the visitor is on. */
export function LoginButton() {
  const path = usePathname();
  return (
    <Button asChild variant="inverse" size="lg">
      <Link href={`/login?next=${encodeURIComponent(path)}`}>เข้าสู่ระบบ</Link>
    </Button>
  );
}
