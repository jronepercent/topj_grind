"use client";
import * as React from "react";
import { Copy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { absoluteUrl, copyLink, useShareStore } from "@/lib/stores/share";
import { formatDuration } from "@/lib/format";
import { inputClass } from "@/components/ui/misc";

export function ShareDialog() {
  const { target, set } = useShareStore();
  const [withTime, setWithTime] = React.useState(false);
  React.useEffect(() => setWithTime(false), [target]);
  if (!target) return null;
  const t = Math.floor(target.time ?? 0);
  const path = withTime && t > 0 ? `${target.path}${target.path.includes("?") ? "&" : "?"}t=${t}` : target.path;
  const url = absoluteUrl(path);
  return (
    <Dialog open onOpenChange={(o) => !o && set(null)}>
      <DialogContent className="max-w-md">
        <DialogTitle>แชร์</DialogTitle>
        <p className="t-meta mt-1 line-clamp-1">{target.title}</p>
        <div className="mt-5 flex gap-2">
          <input readOnly value={url} className={inputClass + " min-w-0 flex-1 text-[14px]"} onFocus={(e) => e.currentTarget.select()} aria-label="ลิงก์" />
          <Button variant="inverse" onClick={() => copyLink(path)}>
            <Copy /> คัดลอก
          </Button>
        </div>
        {t > 0 && (
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[14px]">
            <input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            เริ่มที่ <span className="tnum">{formatDuration(t)}</span>
          </label>
        )}
      </DialogContent>
    </Dialog>
  );
}
