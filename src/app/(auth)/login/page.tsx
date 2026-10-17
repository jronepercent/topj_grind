import type { Metadata } from "next";
import { LoginForm } from "../_components/auth-forms";
import { DemoAccounts } from "../_components/demo-accounts";
import { safeNext } from "../_components/safe-next";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <LoginForm next={safeNext(sp.next)} linkError={sp.error === "link"} />
      <DemoAccounts />
    </>
  );
}
