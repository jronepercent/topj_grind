import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/clients";
import { isUuid } from "@/lib/server/queries";
import { MemberHeader } from "@/components/studio/member-profile";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { getMemberDetail } from "../../_lib/data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: "สมาชิก" };
  const { data } = await adminDb().from("profiles").select("display_name").eq("id", id).maybeSingle();
  return { title: data?.display_name || "สมาชิก" };
}

export default async function MemberLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await getMemberDetail(id);
  if (!d) notFound();
  const base = `/studio/members/${id}`;
  return (
    <div className="space-y-6">
      <MemberHeader d={d} />
      <StudioTabs
        label="หมวดข้อมูลสมาชิก"
        tabs={[
          { href: base, label: "ภาพรวม" },
          { href: `${base}/billing`, label: "การเงิน" },
          { href: `${base}/watch`, label: "การดู", count: d.clips_started },
          { href: `${base}/community`, label: "ชุมชน" },
          { href: `${base}/log`, label: "อีเมลและประวัติ" },
        ]}
      />
      {children}
    </div>
  );
}
