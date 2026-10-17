import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShortsPage } from "@/components/shorts/shorts-page";
import { getContent } from "@/lib/server/queries";
import { contentMetadata } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await getContent(id, null);
  return c ? contentMetadata(c, `/shorts/${id}`) : { title: "Shorts" };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const page = await ShortsPage({ id });
  if (!page) notFound();
  return page;
}
