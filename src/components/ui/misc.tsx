import * as React from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[12px]", className)} aria-hidden />;
}

export function Avatar({ src, name, size = 36, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.42, background: src ? "var(--surface)" : `hsl(${hue} 32% 36%)` }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </span>
  );
}

/** Member Gold badge. locked=true adds the lock (shown to non-members). */
export function MemberBadge({ locked, className, label = "สมาชิก" }: { locked?: boolean; className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
        locked ? "bg-black/70 text-[#E8C77A] backdrop-blur" : "bg-member/15 text-member",
        className,
      )}
    >
      {locked && <Lock className="size-3" strokeWidth={2.25} aria-hidden />}
      {label}
    </span>
  );
}

export function CreatorBadge() {
  return <span className="rounded-full bg-text px-2 py-0.5 text-[11px] font-semibold leading-4 text-bg">ผู้สร้าง</span>;
}

export function SectionHeader({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4", className)}>
      <h2 className="t-h2">{title}</h2>
      {action}
    </div>
  );
}

export type ArtKind = "play" | "search" | "bell" | "bookmark" | "history" | "comment" | "heart";

export function EmptyState({
  title,
  body,
  action,
  art = "play",
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  art?: ArtKind;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      <LineArt kind={art} />
      <h3 className="t-h2 mt-6">{title}</h3>
      {body && <p className="t-meta mt-2 max-w-sm">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Minimal line illustrations for empty states. */
function LineArt({ kind }: { kind: ArtKind }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 120 96" className="h-24 w-[120px] text-text-2" aria-hidden>
      <rect x="10" y="14" width="100" height="64" rx="12" {...s} opacity={0.35} />
      {kind === "play" && <path d="M52 34v28l22-14z" {...s} />}
      {kind === "search" && (
        <>
          <circle cx="56" cy="44" r="13" {...s} />
          <path d="M66 54l10 10" {...s} />
        </>
      )}
      {kind === "bell" && <path d="M48 58h24M51 58V44a9 9 0 0118 0v14M57 64h6" {...s} />}
      {kind === "bookmark" && <path d="M50 30h20v34l-10-7-10 7z" {...s} />}
      {kind === "heart" && <path d="M60 62s-16-9-16-20a8 8 0 0116-3 8 8 0 0116 3c0 11-16 20-16 20z" {...s} />}
      {kind === "history" && (
        <>
          <circle cx="60" cy="46" r="15" {...s} />
          <path d="M60 38v8l6 4" {...s} />
        </>
      )}
      {kind === "comment" && <path d="M44 34h32a4 4 0 014 4v16a4 4 0 01-4 4H56l-8 6v-6h-4a4 4 0 01-4-4V38a4 4 0 014-4z" {...s} />}
      <circle cx="96" cy="14" r="4" fill="var(--accent)" />
    </svg>
  );
}

export function Field({ label, hint, children, counter }: { label: string; hint?: string; children: React.ReactNode; counter?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium">
        {label}
        {counter && <span className="t-caption tnum text-text-2">{counter}</span>}
      </span>
      {children}
      {hint && <span className="t-caption mt-1 block text-text-2">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text placeholder:text-text-2 outline-none transition-colors focus:border-[var(--border-strong)] focus:bg-elevated";
