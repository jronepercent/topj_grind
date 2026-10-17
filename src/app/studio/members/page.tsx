import { db } from "@/lib/server/store";
import { PageHeader } from "@/components/studio/ui";
import { MembersManager, type AuditEntry, type PaymentErrorEntry } from "@/components/studio/members-manager";
import { memberRows, memberSummary } from "../_lib/data";

export const metadata = { title: "สมาชิก" };

export default async function StudioMembersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const now = Date.now();
  const d = db();
  const rows = memberRows(now);
  const summary = memberSummary(rows, now);

  const names = new Map(d.profiles.map((p) => [p.id, p.display_name]));
  const titles = new Map(d.content.map((c) => [c.id, c.title]));
  const playlists = new Map(d.playlists.map((p) => [p.id, p.title]));
  const audit: AuditEntry[] = [...d.admin_audit_log]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      admin: names.get(a.admin_id) ?? "ผู้ดูแล",
      action: a.action,
      target:
        a.target_type === "user"
          ? (names.get(a.target_id) ?? a.target_id)
          : a.target_type === "content"
            ? (titles.get(a.target_id) ?? a.target_id)
            : a.target_type === "playlist"
              ? (playlists.get(a.target_id) ?? a.target_id)
              : "",
      note: a.note,
      created_at: a.created_at,
    }));

  const paymentErrors: PaymentErrorEntry[] = d.payment_errors
    .filter((e) => !e.resolved)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((e) => {
      let payload = "";
      try {
        payload = JSON.stringify(e.payload, null, 2) ?? "";
      } catch {
        payload = String(e.payload);
      }
      return { id: e.id, reason: e.reason, created_at: e.created_at, payload: payload.length > 1200 ? payload.slice(0, 1200) + "\n…" : payload };
    });

  const status = ["active", "expiring", "expired", "never"].includes(sp.status ?? "") ? (sp.status as "active") : "all";

  return (
    <div>
      <PageHeader title="สมาชิก" description="สถานะคำนวณจากวันหมดอายุเท่านั้น · ทุกการแก้ไขถูกบันทึกในประวัติการดำเนินการ" />
      <MembersManager rows={rows} summary={summary} audit={audit} paymentErrors={paymentErrors} initialStatus={status} initialQuery={sp.q ?? ""} />
    </div>
  );
}
