import { redirect } from "next/navigation";
import { MembersStats } from "@/components/studio/members-manager";
import { MemberFunnel } from "@/components/studio/member-funnel";
import { getFunnel, getMemberSummary } from "../../_lib/data";

export default async function MembersOverviewPage({ searchParams }: { searchParams: Promise<{ seg?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  // Old links (/studio/members?status=… / ?seg=… / ?q=…) now live on the list page.
  if (sp.seg || sp.status || sp.q) {
    const qs = new URLSearchParams();
    if (sp.seg ?? sp.status) qs.set("seg", (sp.seg ?? sp.status)!);
    if (sp.q) qs.set("q", sp.q);
    redirect(`/studio/members/list?${qs.toString()}`);
  }
  const [summary, funnel] = await Promise.all([getMemberSummary(), getFunnel()]);
  return (
    <div className="space-y-8">
      <MembersStats summary={summary} />
      <MemberFunnel windows={funnel} />
    </div>
  );
}
