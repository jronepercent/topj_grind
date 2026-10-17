"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Confirm dialog for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "ยืนยัน",
  tone = "danger",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "inverse";
  onConfirm: () => void | Promise<unknown>;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm" hideClose>
        <DialogTitle>{title}</DialogTitle>
        {body && <DialogDescription className="mt-2">{body}</DialogDescription>}
        {children}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button
            variant={tone}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
