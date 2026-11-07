import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/clients";
import { isUuid } from "@/lib/server/queries";
import { MemberProfile } from "@/components/studio/member-profile";
import { memberDetail } from "../../_lib/data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: "สมาชิก" };
  const { data } = await adminDb().from("profiles").select("display_name").eq("id", id).maybeSingle();
  return { title: data?.display_name || "สมาชิก" };
}

export default async function StudioMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await memberDetail(id);
  if (!detail) notFound();
  return <MemberProfile d={detail} />;
}
