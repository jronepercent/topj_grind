import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Pencil } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getArticle, listPostComments } from "@/lib/server/community";
import { siteSettings } from "@/lib/server/queries";
import { articleJsonLd, articleMetadata } from "@/lib/seo";
import { Markdown } from "@/components/community/markdown";
import { ArticleGate } from "@/components/community/article-gate";
import { PostComments } from "@/components/community/post-comments";
import { Avatar, MemberBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { thaiDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = await getArticle(id, await getViewer());
  return a ? articleMetadata(a, `/community/articles/${id}`) : { title: "บทความ" };
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const a = await getArticle(id, viewer);
  if (!a) notFound();
  const draft = a.status !== "published";
  const [settings, comments] = await Promise.all([siteSettings(), a.body !== null && !draft ? listPostComments(a.id, 0) : null]);
  const path = `/community/articles/${a.id}`;
  const authorName = a.author.is_admin ? settings.channel_name : a.author.display_name;

  return (
    <article className="mx-auto max-w-[680px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(a, path, authorName)).replace(/</g, "\\u003c") }} />

      {draft && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 text-[14px]">
          <span className="font-semibold">ฉบับร่าง</span>
          <span className="text-text-2">มองเห็นเฉพาะคุณ ยังไม่เผยแพร่</span>
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link href={`/studio/articles/${a.id}/edit`}>
              <Pencil /> แก้ไข
            </Link>
          </Button>
        </div>
      )}

      <header>
        {a.visibility === "members" && <MemberBadge locked={!viewer?.is_member} className="mb-3" />}
        <h1 className="text-balance text-[30px] font-semibold leading-[1.35] tracking-[-0.015em] sm:text-[38px]">{a.title}</h1>
        <div className="mt-5 flex items-center gap-3">
          <Avatar src={a.author.is_admin ? settings.avatar_url : a.author.avatar_url} name={authorName} size={40} />
          <div className="min-w-0 text-[14px] leading-5">
            <p className="font-semibold">{authorName}</p>
            <p className="t-meta tnum flex flex-wrap items-center gap-x-2">
              <span>{thaiDate(a.published_at ?? a.updated_at)}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden /> อ่าน {a.read_min} นาที
              </span>
            </p>
          </div>
        </div>
      </header>

      {a.cover_url && (
        <div className="relative mt-8 aspect-video overflow-hidden rounded-[16px] bg-elevated">
          <Image src={a.cover_url} alt="" fill priority sizes="(max-width: 720px) 100vw, 680px" className="object-cover" />
        </div>
      )}

      <div className="mt-10">
        {a.body !== null ? (
          <Markdown>{a.body}</Markdown>
        ) : (
          <>
            {a.excerpt && <p className="text-[17px] leading-[1.9] text-text/90">{a.excerpt}</p>}
            <div className="mt-8">
              <ArticleGate />
            </div>
          </>
        )}
      </div>

      {comments && (
        <div className="mt-16 border-t border-border pt-10">
          <PostComments postId={a.id} initial={comments} count={a.comment_count} lockedText="คอมเมนต์และคุยกับ JR ได้เฉพาะสมาชิก" />
        </div>
      )}
    </article>
  );
}
