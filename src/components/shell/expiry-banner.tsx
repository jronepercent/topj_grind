"use client";
import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useViewer } from "@/components/providers";
import { daysUntil } from "@/lib/format";

const KEY = "tg_expiry_banner_dismissed";

/** ≤ 3 days left → reminder. Expired → renew prompt. Dismiss remembers for 24h. */
export function ExpiryBanner() {
  const { viewer } = useViewer();
  const [hidden, setHidden] = React.useState(true);

  React.useEffect(() => {
    try {
      const t = Number(localStorage.getItem(KEY) ?? 0);
      setHidden(Date.now() - t < 86_400_000);
    } catch {
      setHidden(false);
    }
  }, []);

  if (!viewer || viewer.is_admin || !viewer.expires_at || hidden) return null;
  const left = daysUntil(viewer.expires_at);
  const expired = !viewer.is_member;
  if (!expired && left > 3) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-border bg-member/10 px-4 py-2 text-[13px]" role="status">
      <span className="text-center">
        {expired ? (
          <>สมาชิกหมดอายุแล้ว · </>
        ) : (
          <>สมาชิกของคุณจะหมดอายุใน {Math.max(1, left)} วัน · </>
        )}
        <Link href="/membership" className="font-semibold text-member underline-offset-4 hover:underline">
          {expired ? "ต่ออายุเพื่อดูคอนเทนต์ทั้งหมด" : "ต่ออายุ"}
        </Link>
      </span>
      <button
        onClick={() => {
          try {
            localStorage.setItem(KEY, String(Date.now()));
          } catch {}
          setHidden(true);
        }}
        className="rounded-full p-1 text-text-2 hover:bg-hover"
        aria-label="ปิดแถบแจ้งเตือน"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
