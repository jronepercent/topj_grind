import { cn } from "@/lib/utils";

/** Shared pill look (Spotify style): active = solid light, others = subtle gray. Plain module, so server components can use it too. */
export function pillClass(active: boolean) {
  return cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors",
    active ? "bg-text text-bg" : "bg-hover text-text hover:bg-[var(--border-strong)]",
  );
}
