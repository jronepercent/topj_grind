"use client";
import * as React from "react";
import Link from "next/link";
import { tokenize } from "@/lib/richtext";
import { seekTo } from "@/lib/stores/bus";

/**
 * Safe auto-linking: URLs, #tags and 12:34 timestamps.
 * Built from text tokens only — never dangerouslySetInnerHTML.
 */
export function RichText({ text, className, onTime }: { text: string; className?: string; onTime?: (sec: number) => void }) {
  const tokens = React.useMemo(() => tokenize(text), [text]);
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {tokens.map((t, i) => {
        if (t.kind === "url")
          return (
            <a key={i} href={t.value} target="_blank" rel="noopener noreferrer nofollow" className="text-[#3ea6ff] hover:underline">
              {t.value.replace(/^https?:\/\//, "")}
            </a>
          );
        if (t.kind === "tag")
          return (
            <Link key={i} href={`/search?q=${encodeURIComponent(t.value)}`} className="text-[#3ea6ff] hover:underline">
              {t.value}
            </Link>
          );
        if (t.kind === "time")
          return (
            <button
              key={i}
              type="button"
              onClick={() => (onTime ? onTime(t.sec) : seekTo(t.sec))}
              className="tnum text-[#3ea6ff] hover:underline"
              aria-label={`ไปที่เวลา ${t.value}`}
            >
              {t.value}
            </button>
          );
        return <React.Fragment key={i}>{t.value}</React.Fragment>;
      })}
    </span>
  );
}
