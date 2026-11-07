"use client";
import * as React from "react";
import { track } from "@/lib/analytics";

/** Plain <a> (the route is a redirect — a download or a tool — so it must never be prefetched) that reports the take. Works under <Button asChild>. */
export function FreebieClaimLink({ freebieId, kind, onClick, ...rest }: { freebieId: string; kind: "file" | "tool" } & React.ComponentProps<"a">) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        track("freebie_claimed", { freebie_id: freebieId, kind });
        onClick?.(e);
      }}
    />
  );
}
