"use client";
import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  EllipsisVertical,
  EyeOff,
  Flag,
  Heart,
  ListFilter,
  Pencil,
  Pin,
  UserRound,
  ThumbsUp,
  Trash2,
  Ban,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { RichText } from "@/components/content/rich-text";
import { Avatar, CreatorBadge, EmptyState, MemberBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import {
  banUserAction,
  deleteCommentAction,
  editCommentAction,
  likeCommentAction,
  loadCommentsAction,
  loadRepliesAction,
  moderateCommentAction,
  postCommentAction,
  reportCommentAction,
} from "@/app/actions";
import { formatCount, formatNumber } from "@/lib/format";
import type { CommentView, Visibility } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";

const MAX = 1000;

interface Props {
  contentId: string;
  visibility: Visibility;
  enabled: boolean;
  initial: { items: CommentView[]; total: number; hasMore: boolean };
  /** for timestamps inside comments */
  onTime?: (sec: number) => void;
  compact?: boolean;
}

export function Comments({ contentId, visibility, enabled, initial, onTime, compact }: Props) {
  const { viewer } = useViewer();
  const [items, setItems] = React.useState(initial.items);
  const [total, setTotal] = React.useState(initial.total);
  const [hasMore, setHasMore] = React.useState(initial.hasMore);
  const [sort, setSort] = React.useState<"top" | "new">("top");
  const [loading, setLoading] = React.useState(false);
  const canComment = enabled && !!viewer && (visibility === "public" || viewer.is_member);

  const load = async (s: "top" | "new", offset: number) => {
    setLoading(true);
    const r = await loadCommentsAction(contentId, s, offset);
    setLoading(false);
    if (!r.ok) return toast(r.error);
    setItems((xs) => (offset === 0 ? r.data.items : [...xs, ...r.data.items.filter((c) => !xs.some((x) => x.id === c.id))]));
    setHasMore(r.data.hasMore);
    setTotal(r.data.total);
  };

  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && !loading && load(sort, items.length), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, items.length, sort]);

  const update = (id: string, patch: Partial<CommentView> | null) =>
    setItems((xs) => (patch === null ? xs.filter((x) => x.id !== id) : xs.map((x) => (x.id === id ? { ...x, ...patch } : x))));

  return (
    <section id="comments" className="scroll-mt-20" aria-label="ความคิดเห็น">
      <div className={cn("flex items-center gap-6", compact ? "mb-4" : "mb-6")}>
        <h2 className="t-h2 tnum">ความคิดเห็น {formatNumber(total)} รายการ</h2>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="flex items-center gap-2 text-[14px] font-medium" aria-label="เรียงความคิดเห็น">
              <ListFilter className="size-5" strokeWidth={1.75} /> เรียงตาม
            </button>
          </DropdownTrigger>
          <DropdownContent align="start">
            {(
              [
                ["top", "ยอดนิยม"],
                ["new", "ใหม่สุด"],
              ] as const
            ).map(([k, label]) => (
              <DropdownItem
                key={k}
                className={cn(sort === k && "bg-hover")}
                onSelect={() => {
                  setSort(k);
                  load(k, 0);
                }}
              >
                {label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      </div>

      {!enabled ? (
        <p className="t-meta mb-6 rounded-[12px] bg-surface px-4 py-3">ผู้สร้างปิดความคิดเห็นสำหรับคลิปนี้</p>
      ) : canComment ? (
        <Composer
          onSubmit={async (body) => {
            const temp: CommentView = optimistic(viewer!, contentId, body, null);
            setItems((xs) => [temp, ...xs]);
            setTotal((t) => t + 1);
            const r = await postCommentAction(contentId, body, null);
            if (!r.ok) {
              setItems((xs) => xs.filter((x) => x.id !== temp.id));
              setTotal((t) => t - 1);
              toast(r.error);
              return false;
            }
            setItems((xs) => xs.map((x) => (x.id === temp.id ? r.data : x)));
            return true;
          }}
        />
      ) : (
        <ComposerGate visibility={visibility} />
      )}

      <div className="mt-6 space-y-6">
        {items.length === 0 && !loading && enabled && <EmptyState art="comment" title="ยังไม่มีความคิดเห็น" body="เป็นคนแรกที่แสดงความคิดเห็น" className="py-8" />}
        {items.map((c) => (
          <CommentItem key={c.id} c={c} contentId={contentId} canComment={canComment} onTime={onTime} onChange={(p) => update(c.id, p)} onCountChange={(d) => setTotal((t) => t + d)} />
        ))}
        {hasMore && (
          <div ref={sentinel} className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-32 rounded" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function optimistic(viewer: NonNullable<ReturnType<typeof useViewer>["viewer"]>, contentId: string, body: string, parentId: string | null): CommentView {
  return {
    id: `temp-${Date.now()}`,
    content_id: contentId,
    user_id: viewer.id,
    parent_id: parentId,
    body,
    like_count: 0,
    is_pinned: false,
    creator_hearted: false,
    is_hidden: false,
    edited_at: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    author: { id: viewer.id, display_name: viewer.display_name, avatar_url: viewer.avatar_url, is_creator: viewer.is_admin, is_member: viewer.is_member && !viewer.is_admin },
    liked_by_me: false,
    reply_count: 0,
  };
}

function ComposerGate({ visibility }: { visibility: Visibility }) {
  const { viewer, requireAuth } = useViewer();
  const href = useSubscribeHref();
  if (!viewer)
    return (
      <button onClick={() => requireAuth("เข้าสู่ระบบเพื่อแสดงความคิดเห็น")} className="flex w-full items-center gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-elevated text-text-2" aria-hidden>
          <UserRound className="size-5" strokeWidth={1.75} />
        </span>
        <span className="flex-1 border-b border-border pb-2 text-[14px] text-text-2">เข้าสู่ระบบเพื่อแสดงความคิดเห็น…</span>
      </button>
    );
  if (visibility === "members")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface px-4 py-3 text-[14px]">
        <MemberBadge locked />
        คอมเมนต์คุยกับ JR ได้เฉพาะสมาชิก
        <Link href={href} className="ml-auto font-semibold text-member hover:underline">
          สมัครสมาชิก
        </Link>
      </div>
    );
  return null;
}

function Composer({
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

  const reset = () => {
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
      setActive(!!autoFocus && false);
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
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Escape") reset();
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
            <Button variant="ghost" size="sm" onClick={reset}>
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
  contentId,
  canComment,
  onChange,
  onCountChange,
  onTime,
  isReply,
}: {
  c: CommentView;
  contentId: string;
  canComment: boolean;
  onChange: (patch: Partial<CommentView> | null) => void;
  onCountChange: (d: number) => void;
  onTime?: (s: number) => void;
  isReply?: boolean;
}) {
  const { viewer, requireAuth, settings } = useViewer();
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const [replies, setReplies] = React.useState<CommentView[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pop, setPop] = React.useState(false);
  const mine = viewer?.id === c.user_id;
  const admin = !!viewer?.is_admin;
  const temp = c.id.startsWith("temp-");

  const like = async () => {
    if (!requireAuth("เข้าสู่ระบบเพื่อถูกใจความคิดเห็น")) return;
    const next = !c.liked_by_me;
    onChange({ liked_by_me: next, like_count: c.like_count + (next ? 1 : -1) });
    if (next) setPop(true);
    const r = await likeCommentAction(c.id);
    if (!r.ok) {
      onChange({ liked_by_me: c.liked_by_me, like_count: c.like_count });
      toast(r.error);
    }
  };

  const moderate = async (action: Parameters<typeof moderateCommentAction>[1], patch: Partial<CommentView>, msg: string) => {
    onChange(patch);
    const r = await moderateCommentAction(c.id, action);
    toast(r.ok ? msg : r.error);
  };

  const toggleReplies = async () => {
    setOpen((o) => !o);
    if (replies === null) {
      const r = await loadRepliesAction(c.id);
      setReplies(r.ok ? r.data : []);
    }
  };

  return (
    <article className={cn("flex gap-3", c.is_hidden && "opacity-50")}>
      <Avatar src={c.author.avatar_url} name={c.author.display_name} size={isReply ? 28 : 40} />
      <div className="min-w-0 flex-1">
        {c.is_pinned && !isReply && (
          <p className="t-caption mb-1 flex items-center gap-1 text-text-2">
            <Pin className="size-3" /> ปักหมุดโดย {settings.channel_name}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[13px] font-semibold", c.author.is_creator && "rounded-full bg-hover px-2")}>
            {c.author.is_creator ? settings.channel_name : c.author.display_name}
          </span>
          {c.author.is_creator && <CreatorBadge />}
          {c.author.is_member && <MemberBadge />}
          <span className="t-caption text-text-2">
            {temp ? "กำลังโพสต์…" : <TimeAgo iso={c.created_at} />}
            {c.edited_at && " (แก้ไขแล้ว)"}
            {c.is_hidden && " · ซ่อนอยู่"}
          </span>
        </div>

        {editing ? (
          <div className="mt-2">
            <Composer
              autoFocus
              initial={c.body}
              submitLabel="บันทึก"
              onCancel={() => setEditing(false)}
              onSubmit={async (body) => {
                const r = await editCommentAction(c.id, body);
                if (!r.ok) {
                  toast(r.error);
                  return false;
                }
                onChange({ body: r.data.body, edited_at: r.data.edited_at });
                setEditing(false);
                return true;
              }}
            />
          </div>
        ) : (
          <p className="mt-1 text-[14px] leading-[22px]">
            <RichText text={c.body} onTime={onTime} />
          </p>
        )}

        {!editing && (
          <div className="-ml-2 mt-1 flex items-center gap-1">
            <button
              onClick={like}
              disabled={temp}
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-text-2 hover:bg-hover hover:text-text"
              aria-label="ถูกใจความคิดเห็น"
              aria-pressed={c.liked_by_me}
            >
              <ThumbsUp className={cn("size-4", c.liked_by_me && "fill-text text-text", pop && "like-pop")} onAnimationEnd={() => setPop(false)} />
              <span className="tnum">{c.like_count > 0 ? formatCount(c.like_count) : ""}</span>
            </button>
            {c.creator_hearted && (
              <span className="relative ml-1 inline-flex" title={`${settings.channel_name} ถูกใจ`}>
                <Avatar src={settings.avatar_url} name="JR" size={20} />
                <Heart className="absolute -bottom-1 -right-1.5 size-3 fill-danger text-danger" />
              </span>
            )}
            {canComment && !temp && (
              <button onClick={() => setReplying(true)} className="rounded-full px-3 py-1 text-[12px] font-semibold hover:bg-hover">
                ตอบกลับ
              </button>
            )}
            {!temp && viewer && (
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
                  {admin && !isReply && (
                    <DropdownItem onSelect={() => moderate(c.is_pinned ? "unpin" : "pin", { is_pinned: !c.is_pinned }, c.is_pinned ? "เลิกปักหมุดแล้ว" : "ปักหมุดแล้ว")}>
                      <Pin /> {c.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                    </DropdownItem>
                  )}
                  {admin && (
                    <DropdownItem onSelect={() => moderate(c.creator_hearted ? "unheart" : "heart", { creator_hearted: !c.creator_hearted }, c.creator_hearted ? "เอาหัวใจออกแล้ว" : "ส่งหัวใจแล้ว")}>
                      <Heart /> {c.creator_hearted ? "เอาหัวใจออก" : "หัวใจจากผู้สร้าง"}
                    </DropdownItem>
                  )}
                  {admin && (
                    <DropdownItem onSelect={() => moderate(c.is_hidden ? "unhide" : "hide", { is_hidden: !c.is_hidden }, c.is_hidden ? "แสดงความคิดเห็นแล้ว" : "ซ่อนความคิดเห็นแล้ว")}>
                      {c.is_hidden ? <Eye /> : <EyeOff />} {c.is_hidden ? "เลิกซ่อน" : "ซ่อน"}
                    </DropdownItem>
                  )}
                  {(mine || admin) && (
                    <DropdownItem
                      className="text-danger [&_svg]:text-danger"
                      onSelect={async () => {
                        if (!confirm("ลบความคิดเห็นนี้?")) return;
                        onChange(null);
                        onCountChange(-1);
                        const r = await deleteCommentAction(c.id);
                        toast(r.ok ? "ลบความคิดเห็นแล้ว" : r.error);
                      }}
                    >
                      <Trash2 /> ลบ
                    </DropdownItem>
                  )}
                  {admin && !c.author.is_creator && (
                    <DropdownItem
                      className="text-danger [&_svg]:text-danger"
                      onSelect={async () => {
                        if (!confirm(`แบน ${c.author.display_name}? ผู้ใช้นี้จะคอมเมนต์ ถูกใจ และบันทึกไม่ได้อีก`)) return;
                        const r = await banUserAction(c.user_id, true);
                        toast(r.ok ? "แบนผู้ใช้แล้ว" : r.error);
                      }}
                    >
                      <Ban /> แบนผู้ใช้
                    </DropdownItem>
                  )}
                  {!mine && (
                    <>
                      {(admin || mine) && <DropdownSeparator />}
                      <DropdownItem
                        onSelect={async () => {
                          const reason = prompt("รายงานความคิดเห็นนี้เพราะ… (เช่น สแปม, ไม่เหมาะสม)") ?? "";
                          if (!reason.trim()) return;
                          const r = await reportCommentAction(c.id, reason);
                          toast(r.ok ? "ขอบคุณที่รายงาน เราจะตรวจสอบ" : r.error);
                        }}
                      >
                        <Flag /> รายงาน
                      </DropdownItem>
                    </>
                  )}
                </DropdownContent>
              </Dropdown>
            )}
          </div>
        )}

        {replying && (
          <div className="mt-2">
            <Composer
              autoFocus
              compact
              submitLabel="ตอบกลับ"
              initial={isReply ? `@${c.author.display_name} ` : ""}
              onCancel={() => setReplying(false)}
              onSubmit={async (body) => {
                const parent = c.parent_id ?? c.id;
                const r = await postCommentAction(contentId, body, parent);
                if (!r.ok) {
                  toast(r.error);
                  return false;
                }
                onCountChange(1);
                if (isReply) {
                  onChange({}); // parent list re-renders through its own state
                  window.dispatchEvent(new CustomEvent("tg:reply", { detail: { parent, reply: r.data } }));
                } else {
                  setReplies((xs) => [...(xs ?? []), r.data]);
                  onChange({ reply_count: c.reply_count + 1 });
                  setOpen(true);
                }
                setReplying(false);
                return true;
              }}
            />
          </div>
        )}

        {!isReply && <ReplyList c={c} open={open} replies={replies} setReplies={setReplies} toggle={toggleReplies} contentId={contentId} canComment={canComment} onTime={onTime} onCountChange={onCountChange} />}
      </div>
    </article>
  );
}

function ReplyList({
  c,
  open,
  replies,
  setReplies,
  toggle,
  contentId,
  canComment,
  onTime,
  onCountChange,
}: {
  c: CommentView;
  open: boolean;
  replies: CommentView[] | null;
  setReplies: React.Dispatch<React.SetStateAction<CommentView[] | null>>;
  toggle: () => void;
  contentId: string;
  canComment: boolean;
  onTime?: (s: number) => void;
  onCountChange: (d: number) => void;
}) {
  React.useEffect(() => {
    const onReply = (e: Event) => {
      const { parent, reply } = (e as CustomEvent).detail as { parent: string; reply: CommentView };
      if (parent === c.id) setReplies((xs) => [...(xs ?? []), reply]);
    };
    window.addEventListener("tg:reply", onReply);
    return () => window.removeEventListener("tg:reply", onReply);
  }, [c.id, setReplies]);

  const count = replies?.length ?? c.reply_count;
  if (!count) return null;
  return (
    <div className="mt-1">
      <button onClick={toggle} className="-ml-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold text-[#3ea6ff] hover:bg-[#3ea6ff]/10">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /> {formatNumber(count)} การตอบกลับ
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {replies === null
            ? [0].map((i) => <div key={i} className="skeleton h-10 rounded-[10px]" />)
            : replies.map((r) => (
                <CommentItem
                  key={r.id}
                  c={r}
                  isReply
                  contentId={contentId}
                  canComment={canComment}
                  onTime={onTime}
                  onCountChange={onCountChange}
                  onChange={(patch) =>
                    setReplies((xs) => (patch === null ? (xs ?? []).filter((x) => x.id !== r.id) : (xs ?? []).map((x) => (x.id === r.id ? { ...x, ...patch } : x))))
                  }
                />
              ))}
        </div>
      )}
    </div>
  );
}
