"use client";
import * as React from "react";
import { track } from "@/lib/analytics";

/** Plain <a> (the route is a download redirect, never prefetch) that reports the click. Spreads props so it works under <Button asChild>. */
export function SampleDownloadLink({ productId, onClick, ...rest }: { productId: string } & React.ComponentProps<"a">) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        track("sample_downloaded", { product_id: productId });
        onClick?.(e);
      }}
    />
  );
}
