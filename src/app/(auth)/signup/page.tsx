import type { Metadata } from "next";
import { SignupForm } from "../_components/auth-forms";
import { DemoAccounts } from "../_components/demo-accounts";
import { safeNext } from "../_components/safe-next";
import { googleEnabled } from "@/lib/server/providers";

export const metadata: Metadata = {
  title: "สร้างบัญชี",
  robots: { index: false, follow: false },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [sp, google] = await Promise.all([searchParams, googleEnabled()]);
  return (
    <>
      <SignupForm next={safeNext(sp.next)} google={google} />
      <DemoAccounts />
    </>
  );
}
