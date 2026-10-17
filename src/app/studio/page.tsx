import Link from "next/link";
import { ArrowUpRight, CircleAlert, Clock, Eye, TriangleAlert, Users, Hourglass } from "lucide-react";
import { adminDb } from "@/lib/supabase/clients";
import { isLive } from "@/lib/server/queries";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, DailyBars, PageHeader, StatCard, StudioThumb } from "@/components/studio/ui";
import { dailyFromViews, membershipCounts, recentViews, studioContent, unansweredComments } from "./_lib/data";
import { formatCount, formatNumber, timeAgo, TYPE_LABEL } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function StudioDashboard() {
  const now = Date.now();
  const [recent, counts, content, unanswered, paymentErrorsRes] = await Promise.all([
    recentViews(28, undefined, now),
    membershipCounts(now),
    studioContent(),
    unansweredComments(5),
    adminDb().from("payment_errors").select("id", { count: "exact", head: true }).eq("resolved", false),
  ]);

  const views28 = recent.length;
  const watchHours = recent.reduce((s, v) => s + (v.watched_sec || 0), 0) / 3600;
  const members = counts.members;
  const expiring = counts.expiring7;
  const daily = dailyFromViews(recent, 28, now);

  // Top content by views in the last 28 days (falls back to lifetime count on ties)
  const per = new Map<string, number>();
  for (const v of recent) per.set(v.content_id, (per.get(v.content_id) ?? 0) + 1);
  const top = content
    .map((c) => ({ c, n: per.get(c.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || b.c.view_count - a.c.view_count)
    .slice(0, 5);

  const failed = content.filter((c) => c.media_status === "failed");
  const paymentErrors = paymentErrorsRes.count ?? 0;
  const liveCount = content.filter((c) => isLive(c, now)).length;

  return (
    <div>
      <PageHeader title="Dashboard" description={`ภาพรวมช่องในช่วง 28 วันที่ผ่านมา · คอนเทนต์ที่เผยแพร่อยู่ ${formatNumber(liveCount)} รายการ`} />

      {(failed.length > 0 || paymentErrors > 0) && (
        <div className="mb-6 space-y-2" role="status">
          {failed.length > 0 && (
            <Alert
              icon={<TriangleAlert />}
              title={`วิดีโอประมวลผลไม่สำเร็จ ${failed.length} รายการ`}
              body={failed.map((c) => c.title).slice(0, 3).join(" · ")}
              href={`/studio/content/${failed[0].id}/edit`}
              cta="อัปโหลดใหม่"
            />
          )}
          {paymentErrors > 0 && (
            <Alert
              icon={<CircleAlert />}
              title={`การชำระเงินที่ต้องตรวจสอบ ${paymentErrors} รายการ`}
              body="ระบบรับแจ้งชำระเงินแต่จับคู่ผู้ใช้ไม่ได้ ตรวจสอบและต่ออายุให้เองได้ที่หน้าสมาชิก"
              href="/studio/members#payment-errors"
              cta="ตรวจสอบ"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="การดู 28 วัน" value={views28} icon={<Eye />} hint={`เฉลี่ย ${formatNumber(Math.round(views28 / 28))} ครั้งต่อวัน`} />
        <StatCard label="เวลาดูรวม" value={formatNumber(Math.round(watchHours * 10) / 10)} unit="ชั่วโมง" icon={<Clock />} hint="ใน 28 วันล่าสุด" />
        <StatCard label="สมาชิกปัจจุบัน" value={members} icon={<Users />} tone="member" />
        <StatCard
          label="ใกล้หมดอายุ"
          value={expiring}
          icon={<Hourglass />}
          hint={<Link href="/studio/members" className="hover:text-text">ภายใน 7 วัน · ดูรายชื่อ</Link>}
        />
      </div>

      <Card className="mt-6">
        <CardHeader title="การดูรายวัน" description="28 วันล่าสุด (เวลาประเทศไทย)" />
        <div className="px-5 pb-5 pt-6">
          <DailyBars data={daily} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="คอนเทนต์ยอดนิยม"
            description="จัดอันดับจากการดูใน 28 วัน"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/studio/content">ทั้งหมด</Link>
              </Button>
            }
          />
          <ol className="px-2 pb-3 pt-2">
            {top.map(({ c, n }, i) => (
              <li key={c.id}>
                <Link href={`/studio/content/${c.id}/edit`} className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-hover">
                  <span className="tnum w-5 text-center text-[14px] font-semibold text-text-2">{i + 1}</span>
                  <StudioThumb src={c.thumbnail_url} type={c.type} className="w-24" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[14px] font-medium leading-5">{c.title}</p>
                    <p className="t-caption mt-0.5 text-text-2">{TYPE_LABEL[c.type]}</p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-[15px] font-semibold">{formatNumber(n)}</p>
                    <p className="t-caption tnum text-text-2">ทั้งหมด {formatCount(c.view_count)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title="ความคิดเห็นที่ยังไม่ได้ตอบ"
            description="ล่าสุด 5 รายการ"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/studio/comments?tab=unanswered">ตอบกลับ</Link>
              </Button>
            }
          />
          {unanswered.length === 0 ? (
            <EmptyState art="comment" title="ตอบครบทุกความคิดเห็นแล้ว" body="ความคิดเห็นใหม่จะแสดงที่นี่" className="py-10" />
          ) : (
            <ul className="px-2 pb-3 pt-2">
              {unanswered.map(({ c, author, content }) => (
                <li key={c.id}>
                  <Link href="/studio/comments?tab=unanswered" className="flex gap-3 rounded-[12px] px-3 py-3 hover:bg-hover">
                    <Avatar src={author?.avatar_url} name={author?.display_name ?? "ผู้ใช้"} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]">
                        <span className="font-semibold">{author?.display_name ?? "ผู้ใช้"}</span>
                        <span className="t-caption ml-2 text-text-2">{timeAgo(c.created_at, now)}</span>
                      </p>
                      <p className="line-clamp-2 mt-0.5 text-[14px] leading-5">{c.body}</p>
                      {content && <p className="t-caption mt-1 truncate text-text-2">ใน {content.title}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Alert({ icon, title, body, href, cta }: { icon: React.ReactNode; title: string; body: string; href: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-danger/30 bg-danger/[0.06] px-4 py-3">
      <span className="text-danger [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="t-meta truncate">{body}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={href}>
          {cta} <ArrowUpRight />
        </Link>
      </Button>
    </div>
  );
}
