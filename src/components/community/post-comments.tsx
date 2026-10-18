"use client";
import * as React from "react";
import Link from "next/link";
import { EllipsisVertical, EyeOff, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { RichText } from "@/components/content/rich-text";
import { Avatar, CreatorBadge, EmptyState, MemberBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import {
  deletePostCommentAction,
  editPostCommentAction,
  loadPostCommentsAction,
  moderatePostCommentAction,
  postCommentOnPostAction,
} from "@/app/community-actions";
import { POST_LIMITS, type PostCommentView } from "@/lib/community";
import { formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX = POST_LIMITS.comment;

interface Props {
  postId: string;
  initial: { items: PostCommentView[]; total: number; hasMore: boolean };
  /** Header count (the post's comment_count, replies included). */
  count: number;
  /** Shown instead of the box when a guest / non-member is looking. */
  lockedText?: string;
}

/** Comments for a community post or an article (post_comments). One level of replies. */
export function PostComments({ postId, initial, count, lockedText = "คอมเมนต์และตอบกลับได้เฉพาะสมาชิก" }: Props) {
  const { viewer } = useViewer();
  const [items, setItems] = React.useState(initial.items);
  const [total, setTotal] = React.useState(count);
  const [hasMore, setHasMore] = React.useState(initial.hasMore);
  const [loading, setLoading] = React.useState(false);
  const canComment = !!viewer?.is_member;

  const loadMore = async () => {
    setLoading(true);
    const r = await loadPostCommentsAction(postId, items.length);
    setLoading(false);
    if (!r.ok) return toast(r.error);
    setItems((xs) => [...xs, ...r.data.items.filter((c) => !xs.some((x) => x.id === c.id))]);
    setHasMore(r.data.hasMore);
  };

  const mutate = (id: string, f: (c: PostCommentView) => PostCommentView | null) =>
    setItems((xs) =>
      xs.flatMap((c) => {
        if (c.id === id) {
          const n = f(c);
          return n ? [n] : [];
        }
        return [
          {
            ...c,
            replies: c.replies.flatMap((r) => {
              if (r.id !== id) return [r];
              const n = f(r);
              return n ? [n] : [];
            }),
          },
        ];
      }),
    );

  const submitTop = async (body: string) => {
    const r = await postCommentOnPostAction(postId, body, null);
    if (!r.ok) {
      toast(r.error);
      return false;
    }
    setItems((xs) => [r.data, ...xs]);
    setTotal((t) => t + 1);
    return true;
  };

  return (
    <section id="comments" className="scroll-mt-32" aria-label="ความคิดเห็น">
      <h2 className="t-h2 tnum mb-5">ความคิดเห็น {formatNumber(total)} รายการ</h2>

      {canComment ? <Box onSubmit={submitTop} /> : <Gate text={lockedText} />}

      <div className="mt-6 space-y-6">
        {items.length === 0 && <EmptyState art="comment" title="ยังไม่มีความคิดเห็น" body="เป็นคนแรกที่แสดงความคิดเห็น" className="py-8" />}
        {items.map((c) => (
          <CommentItem
            key={c.id}
            c={c}
            canReply={canComment}
            onReply={async (parentId, body) => {
              const r = await postCommentOnPostAction(postId, body, parentId);
              if (!r.ok) {
                toast(r.error);
                return false;
              }
              setItems((xs) => xs.map((x) => (x.id === c.id ? { ...x, replies: [...x.replies, r.data] } : x)));
              setTotal((t) => t + 1);
              return true;
            }}
            onChange={mutate}
            onRemoved={(n) => setTotal((t) => Math.max(0, t - n))}
          />
        ))}
        {hasMore && (
          <Button variant="outline" onClick={loadMore} disabled={loading} className="w-full">
            {loading ? "กำลังโหลด…" : "ดูความคิดเห็นเพิ่ม"}
          </Button>
        )}
      </div>
    </section>
  );
}

function Gate({ text }: { text: string }) {
  const { viewer, requireAuth } = useViewer();
  const href = useSubscribeHref();
  if (!viewer)
    return (
      <button onClick={() => requireAuth("เข้าสู่ระบบเพื่อแสดงความคิดเห็น")} className="flex w-full items-center gap-3 text-left">
        <Avatar name="?" size={40} />
        <span className="flex-1 border-b border-border pb-2 text-[14px] text-text-2">เพิ่มความคิดเห็น…</span>
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface px-4 py-3 text-[14px]">
      <MemberBadge locked />
      {text}
      <Link href={href} className="ml-auto font-semibold text-member hover:underline">
        สมัครสมาชิก
      </Link>
    </div>
  );
}

function Box({
  onSubmit,
  autoFocus,
  onCancel,
  initial = "",
  submitLabel = "แสดงความคิดเห็น",
  compact,
}: {
  onSubmit: (body: string) => Promise<boolean>;
  autoFocus?: boolean;
  onCancel?: () => void;
  initial?: string;
  submitLabel?: string;
  compact?: boolean;
}) {
  const { viewer } = useViewer();
  const [value, setValue] = React.useState(initial);
  const [active, setActive] = React.useState(!!autoFocus);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);
  React.useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const cancel = () => {
    setValue(initial);
    setActive(false);
    onCancel?.();
  };
  const submit = async () => {
    const v = value.trim();
    if (!v || v.length > MAX || busy) return;
    setBusy(true);
    const ok = await onSubmit(v);
    setBusy(false);
    if (ok) {
      setValue("");
      setActive(false);
      onCancel?.();
    }
  };

  return (
    <div className="flex gap-3">
      {viewer && <Avatar src={viewer.avatar_url} name={viewer.display_name} size={compact ? 28 : 40} />}
      <div className="min-w-0 flex-1">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          maxLength={MAX + 50}
          onFocus={() => setActive(true)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            if (e.key === "Escape") cancel();
          }}
          placeholder="เพิ่มความคิดเห็น…"
          aria-label="เขียนความคิดเห็น"
          className="w-full resize-none border-b border-border bg-transparent pb-1.5 text-[14px] leading-6 outline-none transition-colors placeholder:text-text-2 focus:border-text"
        />
        {active && (
          <div className="mt-2 flex items-center justify-end gap-2">
            {value.length > MAX * 0.8 && (
              <span className={cn("t-caption tnum mr-auto", value.length > MAX ? "text-danger" : "text-text-2")}>
                {formatNumber(value.length)}/{formatNumber(MAX)}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={cancel}>
              ยกเลิก
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={!value.trim() || value.length > MAX || busy || value.trim() === initial.trim()}>
              {submitLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  c,
  canReply,
  isReply,
  onReply,
  onChange,
  onRemoved,
}: {
  c: PostCommentView;
  canReply: boolean;
  isReply?: boolean;
  onReply: (parentId: string, body: string) => Promise<boolean>;
  onChange: (id: string, f: (c: PostCommentView) => PostCommentView | null) => void;
  onRemoved: (n: number) => void;
}) {
  const { viewer, settings } = useViewer();
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const mine = viewer?.id === c.user_id;
  const admin = !!viewer?.is_admin;

  return (
    <article className="flex gap-3">
      <Avatar src={c.author.avatar_url} name={c.author.display_name} size={isReply ? 28 : 40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[13px] font-semibold", c.author.is_admin && "rounded-full bg-hover px-2")}>
            {c.author.is_admin ? settings.channel_name : c.author.display_name}
          </span>
          {c.author.is_admin && <CreatorBadge />}
          {c.author.is_member && <MemberBadge />}
          <span className="t-caption text-text-2">
            {timeAgo(c.created_at)}
            {c.edited_at && " (แก้ไขแล้ว)"}
          </span>
        </div>

        {editing ? (
          <div className="mt-2">
            <Box
              autoFocus
              compact
              initial={c.body}
              submitLabel="บันทึก"
              onCancel={() => setEditing(false)}
              onSubmit={async (body) => {
                const r = await editPostCommentAction(c.id, body);
                if (!r.ok) {
                  toast(r.error);
                  return false;
                }
                onChange(c.id, (x) => ({ ...x, body: r.data.body, edited_at: r.data.edited_at }));
                setEditing(false);
                return true;
              }}
            />
          </div>
        ) : (
          <p className="mt-1 text-[14px] leading-[22px]">
            <RichText text={c.body} />
          </p>
        )}

        {!editing && (
          <div className="-ml-2 mt-1 flex items-center gap-1">
            {canReply && (
              <button onClick={() => setReplying(true)} className="rounded-full px-3 py-1 text-[12px] font-semibold hover:bg-hover">
                ตอบกลับ
              </button>
            )}
            {viewer && (mine || admin) && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <button className="ml-auto rounded-full p-1.5 text-text-2 hover:bg-hover" aria-label="ตัวเลือกความคิดเห็น">
                    <EllipsisVertical className="size-4" />
                  </button>
                </DropdownTrigger>
                <DropdownContent align="end">
                  {mine && (
                    <DropdownItem onSelect={() => setEditing(true)}>
                      <Pencil /> แก้ไข
                    </DropdownItem>
                  )}
                  {admin && (
                    <DropdownItem
                      onSelect={async () => {
                        const r = await moderatePostCommentAction(c.id, true);
                        if (!r.ok) return toast(r.error);
                        onChange(c.id, () => null);
                        onRemoved(1 + c.replies.length);
                        toast("ซ่อนความคิดเห็นแล้ว");
                      }}
                    >
                      <EyeOff /> ซ่อน
                    </DropdownItem>
                  )}
                  <DropdownItem
                    className="text-danger [&_svg]:text-danger"
                    onSelect={async () => {
                      if (!confirm("ลบความคิดเห็นนี้?")) return;
                      const r = await deletePostCommentAction(c.id);
                      if (!r.ok) return toast(r.error);
                      onChange(c.id, () => null);
                      onRemoved(1 + c.replies.length);
                      toast("ลบความคิดเห็นแล้ว");
                    }}
                  >
                    <Trash2 /> ลบ
                  </DropdownItem>
                </DropdownContent>
              </Dropdown>
            )}
          </div>
        )}

        {replying && (
          <div className="mt-2">
            <Box
              autoFocus
              compact
              submitLabel="ตอบกลับ"
              initial={isReply ? `@${c.author.display_name} ` : ""}
              onCancel={() => setReplying(false)}
              onSubmit={async (body) => {
                const ok = await onReply(c.parent_id ?? c.id, body);
                if (ok) setReplying(false);
                return ok;
              }}
            />
          </div>
        )}

        {c.replies.length > 0 && (
          <div className="mt-4 space-y-4">
            {c.replies.map((r) => (
              <CommentItem key={r.id} c={r} isReply canReply={canReply} onReply={onReply} onChange={onChange} onRemoved={onRemoved} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
