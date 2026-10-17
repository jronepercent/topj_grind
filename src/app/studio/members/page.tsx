import { adminDb, must } from "@/lib/supabase/clients";
import { isUuid } from "@/lib/server/queries";
import { PageHeader } from "@/components/studio/ui";
import { MembersManager, type AuditEntry, type PaymentErrorEntry } from "@/components/studio/members-manager";
import type { AuditLog, PaymentError } from "@/lib/types";
import { fetchIn, memberRows, memberSummary } from "../_lib/data";

export const metadata = { title: "สมาชิก" };

export default async function StudioMembersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const now = Date.now();
  const db = adminDb();
  const [rows, logRes, errRes] = await Promise.all([
    memberRows(now),
    db.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(20),
    db.from("payment_errors").select("*").eq("resolved", false).order("created_at", { ascending: false }),
  ]);
  const summary = await memberSummary(rows, now);
  const log = must(logRes, "audit log") as AuditLog[];

  // Names for the audit trail: admins + user / content / playlist targets.
  const userIds = [...log.map((a) => a.admin_id), ...log.filter((a) => a.target_type === "user").map((a) => a.target_id)].filter(Boolean);
  const contentIds = log.filter((a) => a.target_type === "content").map((a) => a.target_id);
  const playlistIds = log.filter((a) => a.target_type === "playlist").map((a) => a.target_id);
  const [people, titles, playlists] = await Promise.all([
    fetchIn<{ id: string; display_name: string }>(userIds.filter(isUuid), (ids) => db.from("profiles").select("id, display_name").in("id", ids), "names"),
    fetchIn<{ id: string; title: string }>(contentIds.filter(isUuid), (ids) => db.from("content").select("id, title").in("id", ids), "titles"),
    fetchIn<{ id: string; title: string }>(playlistIds.filter(isUuid), (ids) => db.from("playlists").select("id, title").in("id", ids), "playlists"),
  ]);
  const names = new Map(people.map((p) => [p.id, p.display_name]));
  const titleOf = new Map(titles.map((c) => [c.id, c.title]));
  const playlistOf = new Map(playlists.map((p) => [p.id, p.title]));

  const audit: AuditEntry[] = log.map((a) => ({
    id: a.id,
    admin: names.get(a.admin_id) ?? "ผู้ดูแล",
    action: a.action,
    target:
      a.target_type === "user"
        ? (names.get(a.target_id) ?? a.target_id)
        : a.target_type === "content"
          ? (titleOf.get(a.target_id) ?? a.target_id)
          : a.target_type === "playlist"
            ? (playlistOf.get(a.target_id) ?? a.target_id)
            : "",
    note: a.note ?? "",
    created_at: a.created_at,
  }));

  const paymentErrors: PaymentErrorEntry[] = (must(errRes, "payment errors") as PaymentError[]).map((e) => {
    let payload = "";
    try {
      payload = JSON.stringify(e.payload, null, 2) ?? "";
    } catch {
      payload = String(e.payload);
    }
    return { id: e.id, reason: e.reason ?? "", created_at: e.created_at, payload: payload.length > 1200 ? payload.slice(0, 1200) + "\n…" : payload };
  });

  const status = ["active", "expiring", "expired", "never"].includes(sp.status ?? "") ? (sp.status as "active") : "all";

  return (
    <div>
      <PageHeader title="สมาชิก" description="สถานะคำนวณจากวันหมดอายุเท่านั้น · ทุกการแก้ไขถูกบันทึกในประวัติการดำเนินการ" />
      <MembersManager rows={rows} summary={summary} audit={audit} paymentErrors={paymentErrors} initialStatus={status} initialQuery={sp.q ?? ""} />
    </div>
  );
}
