import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { StudioShell } from "@/components/studio/studio-shell";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s · Studio" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Server-side admin gate: every /studio route renders only for role = 'admin'. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  if (!v?.is_admin) forbidden();
  return <StudioShell viewer={{ display_name: v.display_name, avatar_url: v.avatar_url }}>{children}</StudioShell>;
}
