import { getViewer, isDemoMode } from "@/lib/server/auth";
import { siteSettings } from "@/lib/server/queries";
import { db } from "@/lib/server/store";
import { Providers } from "@/components/providers";
import { ShellClient } from "@/components/shell/shell-client";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const s = siteSettings();
  const unread = viewer ? db().notifications.filter((n) => n.user_id === viewer.id && !n.read_at).length : 0;
  return (
    <Providers
      viewer={viewer}
      settings={{
        channel_name: s.channel_name,
        avatar_url: s.avatar_url,
        price_thb: s.price_thb,
        paywall_title: s.paywall_title,
        paywall_benefits: s.paywall_benefits,
      }}
    >
      <ShellClient unread={unread} demo={isDemoMode()}>
        {children}
      </ShellClient>
    </Providers>
  );
}
