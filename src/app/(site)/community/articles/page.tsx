import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { listArticles } from "@/lib/server/community";
import { ArticleCard } from "@/components/community/article-card";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "บทความ",
  description: "บทความจาก JR — คิดให้ชัด ลงมือให้จริง เรื่องการสร้างรายได้จาก Digital Product",
  alternates: { canonical: "/community/articles" },
};

export const dynamic = "force-dynamic";

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: p } = await searchParams;
  const page = Math.max(1, Math.floor(Number(p)) || 1);
  const [viewer, data] = await Promise.all([getViewer(), listArticles(page)]);
  const locked = !viewer?.is_member;

  return (
    <div className="mx-auto max-w-[820px]">
      <h1 className="t-h1">บทความ</h1>
      <p className="t-meta mt-1.5">อ่านจบแล้วเอาไปทำได้เลย</p>

      {data.items.length === 0 ? (
        <EmptyState art="bookmark" title="ยังไม่มีบทความ" body="JR กำลังเขียน เร็ว ๆ นี้" />
      ) : (
        <div className="mt-8 divide-y divide-border">
          {data.items.map((a) => (
            <ArticleCard key={a.id} a={a} locked={locked} className="py-6 first:pt-0" />
          ))}
        </div>
      )}

      {data.pages > 1 && (
        <nav className="mt-8 flex items-center justify-between gap-3" aria-label="หน้าบทความ">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={page === 2 ? "/community/articles" : `/community/articles?page=${page - 1}`}>ก่อนหน้า</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="t-meta tnum">
            หน้า {page} / {data.pages}
          </span>
          {page < data.pages ? (
            <Button asChild variant="outline">
              <Link href={`/community/articles?page=${page + 1}`}>ถัดไป</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
