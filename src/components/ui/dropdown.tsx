"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;
export const DropdownGroup = M.Group;

export function DropdownContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        className={cn(
          "tg-drop z-[90] min-w-[210px] overflow-hidden rounded-[14px] border border-border bg-elevated p-1.5 text-text shadow-2xl",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-40 [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-text-2",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("t-caption px-3 py-1.5 text-text-2", className)} {...props} />;
}
