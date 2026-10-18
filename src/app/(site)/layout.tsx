import { getViewer, isDemoMode } from "@/lib/server/auth";
import { siteSettings, unreadCount } from "@/lib/server/queries";
import { Providers } from "@/components/providers";
import { ShellClient } from "@/components/shell/shell-client";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const s = await siteSettings();
  const unread = viewer ? await unreadCount(viewer.id) : 0;
  return (
    <Providers
      viewer={viewer}
      settings={{
        channel_name: s.channel_name,
        avatar_url: s.avatar_url,
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
