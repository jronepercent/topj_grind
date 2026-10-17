import type { Metadata } from "next";
import { ShortsPage } from "@/components/shorts/shorts-page";

export const metadata: Metadata = { title: "Shorts" };

export default async function Page() {
  return <ShortsPage />;
}
