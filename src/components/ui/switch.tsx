"use client";
import * as React from "react";
import * as S from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full bg-[var(--border-strong)] transition-colors data-[state=checked]:bg-success",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-[22px] translate-x-[2px] rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-apple)] data-[state=checked]:translate-x-[20px]" />
    </S.Root>
  );
}
