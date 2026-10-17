"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Toaster } from "sonner";
import type { SiteSettings, Viewer } from "@/lib/types";
import { Paywall } from "@/components/content/paywall";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import Link from "next/link";

interface Ctx {
  viewer: Viewer | null;
  settings: Pick<SiteSettings, "channel_name" | "avatar_url" | "price_thb" | "paywall_title" | "paywall_benefits">;
  /** Returns true when signed in, otherwise opens the sign-in prompt. */
  requireAuth: (reason?: string) => boolean;
  openPaywall: (thumb?: string | null) => void;
}

const ViewerContext = React.createContext<Ctx | null>(null);

export function useViewer() {
  const c = React.useContext(ViewerContext);
  if (!c) throw new Error("useViewer outside provider");
  return c;
}

export function Providers({
  viewer,
  settings,
  children,
}: {
  viewer: Viewer | null;
  settings: Ctx["settings"];
  children: React.ReactNode;
}) {
  const [authPrompt, setAuthPrompt] = React.useState<string | null>(null);
  const [paywall, setPaywall] = React.useState<{ open: boolean; thumb?: string | null }>({ open: false });
  const pathname = usePathname();

  const value = React.useMemo<Ctx>(
    () => ({
      viewer,
      settings,
      requireAuth: (reason) => {
        if (viewer) return true;
        setAuthPrompt(reason ?? "เข้าสู่ระบบเพื่อใช้งานส่วนนี้");
        return false;
      },
      openPaywall: (thumb) => setPaywall({ open: true, thumb }),
    }),
    [viewer, settings],
  );

  return (
    <ViewerContext.Provider value={value}>
      {children}
      <Dialog open={!!authPrompt} onOpenChange={(o) => !o && setAuthPrompt(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center">
            <LogoMark size={44} />
            <h2 className="t-h2 mt-4">{authPrompt}</h2>
            <p className="t-meta mt-2">ถูกใจ บันทึก และคอมเมนต์ได้หลังเข้าสู่ระบบ</p>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button asChild variant="inverse" size="lg" onClick={() => setAuthPrompt(null)}>
                <Link href={`/login?next=${encodeURIComponent(pathname)}`}>เข้าสู่ระบบ</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" onClick={() => setAuthPrompt(null)}>
                <Link href={`/signup?next=${encodeURIComponent(pathname)}`}>สร้างบัญชีใหม่</Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={paywall.open} onOpenChange={(o) => setPaywall({ open: o })}>
        <DialogContent className="max-w-md p-0" hideClose>
          <Paywall variant="modal" thumb={paywall.thumb} onClose={() => setPaywall({ open: false })} />
        </DialogContent>
      </Dialog>
      <Toaster
        position="bottom-center"
        offset={88}
        mobileOffset={{ bottom: 140 }}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "glass flex w-auto min-w-[260px] max-w-[92vw] items-center gap-3 rounded-full border border-border px-5 py-3 text-[14px] text-text shadow-2xl",
            actionButton: "ml-auto font-semibold text-accent",
            title: "font-medium",
          },
        }}
      />
    </ViewerContext.Provider>
  );
}

/** Hook: refresh server components after a mutation without losing scroll. */
export function useRefresh() {
  const router = useRouter();
  return React.useCallback(() => router.refresh(), [router]);
}
