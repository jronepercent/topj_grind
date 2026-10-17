"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("no-scrollbar flex gap-1 overflow-x-auto border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative shrink-0 px-4 py-3 text-[14px] font-medium text-text-2 transition-colors hover:text-text data-[state=active]:text-text",
        "after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[2px] after:rounded-full after:bg-transparent data-[state=active]:after:bg-text",
        className,
      )}
      {...props}
    />
  );
}
