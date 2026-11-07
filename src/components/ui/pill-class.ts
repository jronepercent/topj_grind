import { cn } from "@/lib/utils";

/** Shared pill look (Spotify style): active = solid light, others = subtle gray. Plain module, so server components can use it too. */
export function pillClass(active: boolean) {
  return cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors",
    active ? "bg-text text-bg" : "bg-hover text-text hover:bg-[var(--border-strong)]",
  );
}

/** Level-2 chip (smaller, bordered), used under the hub's level-1 pills. */
export function chipClass(active: boolean) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
    active ? "border-text bg-hover text-text" : "border-border text-text-2 hover:text-text hover:bg-hover",
  );
}
