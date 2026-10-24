"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ExternalLink, Heart, ImageIcon, Mail, MessageCircle, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PostComposer } from "@/components/community/composer";
import { Button } from "@/components/ui/button";
import { Avatar, CreatorBadge, EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "./confirm";
import { SendEmailDialog } from "./send-email-button";
import { Card } from "./ui";
import { deletePostAction, deletePostCommentAction, moderatePostAction, moderatePostCommentAction } from "@/app/community-actions";
import { formatNumber } from "@/lib/format";
import type { StudioCommentRow, StudioPostRow } from "@/lib/server/community";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";

type Tab = "posts" | "comments";

/** Studio → ชุมชน: JR's own "โพสต์รูป" composer, plus moderation of posts and comments. */
export function CommunityManager({ posts, comments, viewer }: { posts: StudioPostRow[]; comments: StudioCommentRow[]; viewer: { display_name: string; avatar_url: string | null } }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("posts");
  const [delPost, setDelPost] = React.useState<StudioPostRow | null>(null);
  const [delComment, setDelComment] = React.useState<StudioCommentRow | null>(null);
  const [emailPost, setEmailPost] = React.useState<StudioPostRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "ทำรายการไม่ได้");
    toast(msg);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <section aria-label="โพสต์รูป">
        <h2 className="mb-3 text-[16px] font-semibold">โพสต์รูป</h2>
        <PostComposer asViewer={viewer} onPosted={() => router.refresh()} placeholder="โพสต์ถึงสมาชิกในชุมชน แนบรูปได้สูงสุด 10 รูป…" className="max-w-[640px]" />
      </section>

      <div>
        <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="หมวดดูแลชุมชน">
          {(
            [
              ["posts", "โพสต์", posts.length],
              ["comments", "ความคิดเห็น", comments.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "relative px-4 py-3 text-[14px] font-medium transition-colors after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[2px] after:rounded-full",
                tab === k ? "text-text after:bg-text" : "text-text-2 after:bg-transparent hover:text-text",
              )}
            >
              {label} <span className="tnum ml-1 text-text-2">{formatNumber(n)}</span>
            </button>
          ))}
        </div>

        {tab === "posts" ? (
          posts.length === 0 ? (
            <EmptyState art="comment" title="ยังไม่มีโพสต์" body="โพสต์ของสมาชิกและของคุณจะแสดงที่นี่" />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {posts.map((p) => (
                  <li key={p.id} className={cn("flex items-start gap-3 px-4 py-3.5", p.is_hidden && "opacity-60")}>
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-[8px] bg-elevated">
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.images[0]} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-text-2">
                          <ImageIcon className="size-5" strokeWidth={1.5} />
                        </span>
                      )}
                      {p.images.length > 1 && <span className="tnum absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] text-white">{p.images.length}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                        <Avatar src={p.author.avatar_url} name={p.author.display_name} size={20} />
                        <span className="font-semibold">{p.author.display_name}</span>
                        {p.author.is_admin && <CreatorBadge />}
                        <span className="t-caption text-text-2"><TimeAgo iso={p.published_at} /></span>
                        {p.is_pinned && (
                          <span className="inline-flex items-center gap-1 text-[12px] font-medium">
                            <Pin className="size-3" /> ปักหมุด
                          </span>
                        )}
                        {p.is_hidden && <span className="text-[12px] text-text-2">ซ่อนอยู่</span>}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[14px] leading-[21px] [overflow-wrap:anywhere]">{p.body || <span className="text-text-2">(รูปอย่างเดียว)</span>}</p>
                      <p className="t-caption tnum mt-1.5 flex items-center gap-3 text-text-2">
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3.5" /> {formatNumber(p.like_count)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="size-3.5" /> {formatNumber(p.comment_count)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
                      <Button asChild variant="ghost" size="icon-sm" aria-label="ดูโพสต์">
                        <Link href={`/community/posts/${p.id}`} target="_blank">
                          <ExternalLink />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy === `pin-${p.id}`}
                        aria-label={p.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                        title={p.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                        onClick={() => act(`pin-${p.id}`, () => moderatePostAction(p.id, p.is_pinned ? "unpin" : "pin"), p.is_pinned ? "เลิกปักหมุดแล้ว" : "ปักหมุดแล้ว")}
                      >
                        {p.is_pinned ? <PinOff /> : <Pin />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy === `hide-${p.id}`}
                        aria-label={p.is_hidden ? "แสดงโพสต์" : "ซ่อนโพสต์"}
                        title={p.is_hidden ? "แสดงโพสต์" : "ซ่อนโพสต์"}
                        onClick={() => act(`hide-${p.id}`, () => moderatePostAction(p.id, p.is_hidden ? "unhide" : "hide"), p.is_hidden ? "แสดงโพสต์แล้ว" : "ซ่อนโพสต์แล้ว")}
                      >
                        {p.is_hidden ? <Eye /> : <EyeOff />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="ส่งอีเมลแจ้งเตือน"
                        aria-disabled={p.is_hidden}
                        title={p.is_hidden ? "โพสต์ที่ซ่อนอยู่ส่งอีเมลไม่ได้" : "ส่งอีเมลแจ้งเตือน"}
                        className={cn(p.is_hidden && "cursor-not-allowed opacity-40")}
                        onClick={p.is_hidden ? undefined : () => setEmailPost(p)}
                      >
                        <Mail />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="ลบโพสต์" title="ลบโพสต์" className="text-danger" onClick={() => setDelPost(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )
        ) : comments.length === 0 ? (
          <EmptyState art="comment" title="ยังไม่มีความคิดเห็น" body="ความคิดเห็นในโพสต์และบทความจะแสดงที่นี่" />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {comments.map((c) => (
                <li key={c.id} className={cn("flex items-start gap-3 px-4 py-3.5", c.is_hidden && "opacity-60")}>
                  <Avatar src={c.author.avatar_url} name={c.author.display_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
                      <span className="font-semibold">{c.author.display_name}</span>
                      {c.author.is_admin && <CreatorBadge />}
                      <span className="t-caption text-text-2"><TimeAgo iso={c.created_at} /></span>
                      {c.is_hidden && <span className="text-[12px] text-text-2">ซ่อนอยู่</span>}
                    </p>
                    <p className="mt-1 text-[14px] leading-[21px] [overflow-wrap:anywhere]">{c.body}</p>
                    <Link
                      href={`${c.post_kind === "article" ? `/community/articles/${c.post_id}` : `/community/posts/${c.post_id}`}#comments`}
                      target="_blank"
                      className="t-caption mt-1.5 inline-flex max-w-full items-center gap-1 text-text-2 hover:text-text"
                    >
                      <span className="truncate">ใน{c.post_kind === "article" ? "บทความ" : "โพสต์"}: {c.post_label}</span> <ExternalLink className="size-3 shrink-0" />
                    </Link>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy === `ch-${c.id}`}
                      aria-label={c.is_hidden ? "แสดงความคิดเห็น" : "ซ่อนความคิดเห็น"}
                      title={c.is_hidden ? "แสดงความคิดเห็น" : "ซ่อนความคิดเห็น"}
                      onClick={() => act(`ch-${c.id}`, () => moderatePostCommentAction(c.id, !c.is_hidden), c.is_hidden ? "แสดงความคิดเห็นแล้ว" : "ซ่อนความคิดเห็นแล้ว")}
                    >
                      {c.is_hidden ? <Eye /> : <EyeOff />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="ลบความคิดเห็น" title="ลบความคิดเห็น" className="text-danger" onClick={() => setDelComment(c)}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {emailPost && <SendEmailDialog type="post" id={emailPost.id} title={emailPost.body.slice(0, 80) || "(รูปอย่างเดียว)"} onClose={() => setEmailPost(null)} />}
      <ConfirmDialog
        open={!!delPost}
        onOpenChange={(o) => !o && setDelPost(null)}
        title="ลบโพสต์นี้?"
        body="โพสต์จะหายจากชุมชนทันที ย้อนกลับไม่ได้"
        confirmLabel="ลบโพสต์"
        onConfirm={async () => {
          if (!delPost) return;
          const id = delPost.id;
          setDelPost(null);
          await act(`del-${id}`, () => deletePostAction(id), "ลบโพสต์แล้ว");
        }}
      />
      <ConfirmDialog
        open={!!delComment}
        onOpenChange={(o) => !o && setDelComment(null)}
        title="ลบความคิดเห็นนี้?"
        body="ย้อนกลับไม่ได้"
        confirmLabel="ลบ"
        onConfirm={async () => {
          if (!delComment) return;
          const id = delComment.id;
          setDelComment(null);
          await act(`delc-${id}`, () => deletePostCommentAction(id), "ลบความคิดเห็นแล้ว");
        }}
      />
    </div>
  );
}
