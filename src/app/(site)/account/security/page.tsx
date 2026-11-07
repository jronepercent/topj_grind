import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { PasswordCard } from "../_components/account-view";

export const metadata: Metadata = { title: "ความปลอดภัย", robots: { index: false, follow: false } };

export default async function AccountSecurityPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return <PasswordCard />;
}
