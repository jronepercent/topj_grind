import type { Metadata } from "next";
import { ResetPasswordForm, ResetRequestForm } from "../_components/auth-forms";

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return token ? <ResetPasswordForm token={token} /> : <ResetRequestForm />;
}
