import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { memberRows } from "@/app/studio/_lib/data";
import { inSegment, MEMBER_STATUS_LABEL, METHOD_LABEL, ONBOARDING_STAGE_LABEL, parseSegment, PLAN_LABEL, PROVIDER_LABEL } from "@/components/studio/types";
import { thaiDate, thaiDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function cell(v: string) {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** GET /api/studio/members — CSV export (admin only). UTF-8 with BOM so Excel shows Thai correctly. */
export async function GET(req: NextRequest) {
  const v = await getViewer();
  if (!v?.is_admin) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const seg = parseSegment(req.nextUrl.searchParams.get("seg") ?? req.nextUrl.searchParams.get("status"));
  const now = Date.now();
  const rows = (await memberRows(now)).filter(
    (r) =>
      inSegment(r, seg, now) &&
      (!q || r.display_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
  );

  const header = ["ชื่อ", "อีเมล", "วันสมัคร", "วันหมดอายุ", "สถานะ", "ช่องทางจ่ายล่าสุด", "ดูล่าสุด", "ถูกแบน", "สมัครบัญชี", "ล็อกอินด้วย", "ขั้น", "แผน", "จ่ายรวม (บาท)", "คลิปที่ดู", "คลิปที่ดูจบ", "เวลาดูโดยประมาณ (นาที)", "ใช้งานล่าสุด", "รับอีเมล"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.display_name,
        r.email,
        thaiDate(r.first_paid_at),
        thaiDateTime(r.expires_at),
        MEMBER_STATUS_LABEL[r.status],
        r.last_method ? METHOD_LABEL[r.last_method] : "",
        thaiDateTime(r.last_watch),
        r.is_banned ? "ใช่" : "",
        thaiDate(r.signed_up_at),
        PROVIDER_LABEL[r.provider],
        r.onboarding_stage ? ONBOARDING_STAGE_LABEL[r.onboarding_stage] : "",
        r.plan ? PLAN_LABEL[r.plan] : "",
        String(r.lifetime_thb),
        String(r.clips_started),
        String(r.clips_completed),
        String(Math.round(r.watch_sec / 60)),
        thaiDateTime(r.last_active),
        r.email_updates ? "ใช่" : "ไม่",
      ]
        .map(cell)
        .join(","),
    );
  }
  const date = new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="topjgrind-members-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
