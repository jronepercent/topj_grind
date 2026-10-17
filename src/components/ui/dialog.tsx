"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof D.Title>) => (
  <D.Title className={cn("t-h2", className)} {...p} />
);
export const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof D.Description>) => (
  <D.Description className={cn("t-meta", className)} {...p} />
);

const overlay = "tg-overlay fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm";

export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & { hideClose?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        aria-describedby={undefined}
        className={cn(
          "tg-pop fixed left-1/2 top-1/2 z-[81] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] border border-border bg-elevated p-6 text-text shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close className="absolute right-4 top-4 rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label="ปิด">
            <X className="size-5" strokeWidth={1.75} />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

/** Bottom sheet on mobile, side panel on desktop. */
export function SheetContent({
  className,
  children,
  side = "bottom",
  title,
  ...props
}: React.ComponentProps<typeof D.Content> & { side?: "bottom" | "right" | "left"; title?: string }) {
  const pos = {
    bottom: "tg-sheet-up inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[20px] safe-bottom",
    right: "tg-sheet-left inset-y-0 right-0 w-full max-w-md",
    left: "tg-sheet-right inset-y-0 left-0 w-72",
  }[side];
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        aria-describedby={undefined}
        className={cn("fixed z-[81] flex flex-col border border-border bg-elevated text-text outline-none", pos, className)}
        {...props}
      >
        {side === "bottom" && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden />}
        {title ? (
          <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
            <D.Title className="t-h2">{title}</D.Title>
            <D.Close className="rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label="ปิด">
              <X className="size-5" strokeWidth={1.75} />
            </D.Close>
          </div>
        ) : (
          <D.Title className="sr-only">แผง</D.Title>
        )}
        {children}
      </D.Content>
    </D.Portal>
  );
}
