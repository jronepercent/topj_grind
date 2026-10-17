"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CornerDownRight, Eye, EyeOff, Flag, Heart, Pin, Reply, Search, Trash, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState, inputClass, MemberBadge } from "@/components/ui/misc";
import { banUserAction, deleteCommentAction, moderateCommentAction } from "@/app/actions";
import { replyAsCreatorAction } from "@/app/studio/actions";
import { contentHref, formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StudioComment } from "./types";
import { ConfirmDialog } from "./confirm";
import { StudioThumb } from "./ui";

type Tab = "all" | "unanswered" | "reported";

export function CommentsInbox({ comments: initial, initialTab }: { comments: StudioComment[]; initialTab: Tab }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  React.useEffect(() => setItems(initial), [initial]);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [q, setQ] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<null | { kind: "delete" | "ban"; c: StudioComment }>(null);

  const counts = {
    all: items.length,
    unanswered: items.filter((c) => !c.answered).length,
    reported: items.filter((c) => c.reports.length > 0).length,
  };
  const term = q.trim().toLowerCase();
  const list = items.filter(
    (c) =>
      (tab === "all" || (tab === "unanswered" ? !c.answered : c.reports.length > 0)) &&
      (!term || `${c.body} ${c.author.display_name} ${c.content.title}`.toLowerCase().includes(term)),
  );

  const patch = (id: string, p: Partial<StudioComment>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /** Optimistic: apply locally, call the server, roll back on failure. */
  const optimistic = async (apply: () => void, call: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => {
    const before = items;
    apply();
    const r = await call().catch(() => ({ ok: false, error: "เชื่อมต่อไม่สำเร็จ" }));
    if (!r.ok) {
      setItems(before);
      toast(r.error ?? "ทำรายการไม่สำเร็จ");
    } else if (ok) toast(ok);
  };

  const heart = (c: StudioComment) =>
    optimistic(
      () => patch(c.id, { creator_hearted: !c.creator_hearted }),
      () => moderateCommentAction(c.id, c.creator_hearted ? "unheart" : "heart") as Promise<{ ok: boolean; error?: string }>,
    );
  const pin = (c: StudioComment) =>
    optimistic(
      () =>
        setItems((xs) =>
          xs.map((x) => (x.id === c.id ? { ...x, is_pinned: !c.is_pinned } : !c.is_pinned && x.content_id === c.content_id ? { ...x, is_pinned: false } : x)),
        ),
      () => moderateCommentAction(c.id, c.is_pinned ? "unpin" : "pin") as Promise<{ ok: boolean; error?: string }>,
      c.is_pinned ? "เลิกปักหมุดแล้ว" : "ปักหมุดแล้ว",
    );
  const hide = (c: StudioComment) =>
    optimistic(
      () => patch(c.id, { is_hidden: !c.is_hidden }),
      () => moderateCommentAction(c.id, c.is_hidden ? "unhide" : "hide") as Promise<{ ok: boolean; error?: string }>,
      c.is_hidden ? "แสดงความคิดเห็นแล้ว" : "ซ่อนความคิดเห็นแล้ว",
    );

  const reply = async (c: StudioComment, body: string) => {
    const text = body.trim();
    if (!text) return false;
    const before = items;
    patch(c.id, { answered: true, admin_reply: text });
    setReplyTo(null);
    const r = await replyAsCreatorAction(c.content_id, c.id, text).catch(() => null);
    if (!r || !r.ok) {
      setItems(before);
      setReplyTo(c.id);
      toast(r && !r.ok ? r.error : "ส่งไม่สำเร็จ");
      return false;
    }
    toast("ตอบกลับแล้ว");
    router.refresh();
    return true;
  };

  const tabs: [Tab, string][] = [
    ["all", "ทั้งหมด"],
    ["unanswered", "ยังไม่ได้ตอบ"],
    ["reported", "ถูกรายงาน"],
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist" aria-label="กรองความคิดเห็น">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "relative shrink-0 px-4 py-3 text-[14px] font-medium transition-colors",
                tab === k ? "text-text" : "text-text-2 hover:text-text",
                "after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[2px] after:rounded-full",
                tab === k ? "after:bg-text" : "after:bg-transparent",
              )}
            >
              {label} <span className="tnum ml-1 text-text-2">{formatNumber(counts[k])}</span>
            </button>
          ))}
        </div>
        <div className="relative mb-2 w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-2" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาความคิดเห็น" aria-label="ค้นหาความคิดเห็น" className={cn(inputClass, "h-10 rounded-full py-0 pl-10")} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          art="comment"
          title={tab === "unanswered" ? "ตอบครบทุกความคิดเห็นแล้ว" : tab === "reported" ? "ไม่มีความคิดเห็นที่ถูกรายงาน" : "ยังไม่มีความคิดเห็น"}
          body={tab === "all" && !term ? "เมื่อผู้ชมแสดงความคิดเห็น จะมารวมอยู่ที่นี่" : undefined}
        />
      ) : (
        <ul className="divide-y divide-border rounded-[16px] border border-border bg-surface">
          {list.map((c) => (
            <li key={c.id} className={cn("px-4 py-4 sm:px-5", c.is_hidden && "bg-bg/40")}>
              <div className="flex gap-3">
                <Avatar src={c.author.avatar_url} name={c.author.display_name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-semibold">{c.author.display_name}</span>
                    {c.author.is_member && <MemberBadge />}
                    {c.author.is_banned && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">ถูกแบน</span>}
                    <span className="t-caption text-text-2">{timeAgo(c.created_at)}</span>
                    {c.is_pinned && (
                      <span className="t-caption inline-flex items-center gap-1 text-text-2">
                        <Pin className="size-3" aria-hidden /> ปักหมุด
                      </span>
                    )}
                    {c.is_hidden && (
                      <span className="t-caption inline-flex items-center gap-1 text-text-2">
                        <EyeOff className="size-3" aria-hidden /> ซ่อนอยู่
                      </span>
                    )}
                  </div>
                  {c.parent_excerpt && (
                    <p className="t-caption mt-1 flex items-center gap-1 text-text-2">
                      <CornerDownRight className="size-3 shrink-0" aria-hidden /> ตอบกลับ: <span className="truncate">{c.parent_excerpt}</span>
                    </p>
                  )}
                  <p className={cn("mt-1 whitespace-pre-wrap break-words text-[14px] leading-6", c.is_hidden && "text-text-2")}>{c.body}</p>

                  {c.reports.length > 0 && (
                    <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-[12px] font-medium text-danger">
                      <Flag className="size-3.5" aria-hidden /> ถูกรายงาน {c.reports.length} ครั้ง · {[...new Set(c.reports.map((r) => r.reason))].join(", ")}
                    </p>
                  )}

                  {c.admin_reply && (
                    <p className="t-meta mt-2 flex gap-1.5 border-l-2 border-border pl-3">
                      <span className="shrink-0 font-semibold text-text">คุณตอบ:</span>
                      <span className="line-clamp-2">{c.admin_reply}</span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-0.5 -ml-2">
                    <ActionBtn onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} label="ตอบกลับ" icon={<Reply />} text="ตอบกลับ" />
                    <ActionBtn
                      onClick={() => heart(c)}
                      label={c.creator_hearted ? "เอาหัวใจออก" : "ให้หัวใจ"}
                      pressed={c.creator_hearted}
                      icon={<Heart className={cn(c.creator_hearted && "fill-danger text-danger")} />}
                    />
                    {!c.parent_id && (
                      <ActionBtn onClick={() => pin(c)} label={c.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"} pressed={c.is_pinned} icon={<Pin className={cn(c.is_pinned && "fill-current text-text")} />} />
                    )}
                    <ActionBtn onClick={() => hide(c)} label={c.is_hidden ? "แสดง" : "ซ่อน"} icon={c.is_hidden ? <Eye /> : <EyeOff />} text={c.is_hidden ? "แสดง" : "ซ่อน"} />
                    <ActionBtn onClick={() => setConfirm({ kind: "delete", c })} label="ลบความคิดเห็น" icon={<Trash />} />
                    <ActionBtn
                      onClick={() =>
                        c.author.is_banned
                          ? optimistic(
                              () => setItems((xs) => xs.map((x) => (x.author.id === c.author.id ? { ...x, author: { ...x.author, is_banned: false } } : x))),
                              () => banUserAction(c.author.id, false) as Promise<{ ok: boolean; error?: string }>,
                              `ยกเลิกแบน ${c.author.display_name} แล้ว`,
                            )
                          : setConfirm({ kind: "ban", c })
                      }
                      label={c.author.is_banned ? "ยกเลิกแบน" : "แบนผู้ใช้"}
                      icon={c.author.is_banned ? <UserCheck /> : <Ban />}
                      danger={!c.author.is_banned}
                    />
                  </div>

                  {replyTo === c.id && <ReplyBox onCancel={() => setReplyTo(null)} onSend={(t) => reply(c, t)} name={c.author.display_name} />}
                </div>
                <Link href={`${contentHref(c.content)}#comments`} target="_blank" className="hidden w-40 shrink-0 md:block" title={c.content.title}>
                  <StudioThumb src={c.content.thumbnail_url} type={c.content.type} className="w-full" />
                  <p className="t-caption mt-1.5 line-clamp-2 text-text-2">{c.content.title}</p>
                </Link>
              </div>
              <Link href={`${contentHref(c.content)}#comments`} target="_blank" className="t-caption mt-2 block truncate pl-12 text-text-2 md:hidden">
                ใน {c.content.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "ban" ? `แบน ${confirm.c.author.display_name}?` : "ลบความคิดเห็นนี้?"}
        body={
          confirm?.kind === "ban"
            ? "ผู้ใช้นี้จะคอมเมนต์ ถูกใจ และบันทึกคลิปไม่ได้อีก ยกเลิกแบนได้ภายหลัง"
            : "ความคิดเห็นจะหายจากหน้าคลิปทันที"
        }
        confirmLabel={confirm?.kind === "ban" ? "แบนผู้ใช้" : "ลบ"}
        onConfirm={async () => {
          if (!confirm) return;
          const { kind, c } = confirm;
          setConfirm(null);
          if (kind === "delete")
            await optimistic(
              () => setItems((xs) => xs.filter((x) => x.id !== c.id)),
              () => deleteCommentAction(c.id) as Promise<{ ok: boolean; error?: string }>,
              "ลบความคิดเห็นแล้ว",
            );
          else
            await optimistic(
              () => setItems((xs) => xs.map((x) => (x.author.id === c.author.id ? { ...x, author: { ...x.author, is_banned: true } } : x))),
              () => banUserAction(c.author.id, true) as Promise<{ ok: boolean; error?: string }>,
              `แบน ${c.author.display_name} แล้ว`,
            );
        }}
      />
    </div>
  );
}

function ActionBtn({
  onClick,
  label,
  icon,
  text,
  pressed,
  danger,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  text?: string;
  pressed?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={text ? undefined : label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-text-2 transition-colors hover:bg-hover hover:text-text [&_svg]:size-4",
        danger && "hover:text-danger",
      )}
    >
      {icon}
      {text}
    </button>
  );
}

function ReplyBox({ onCancel, onSend, name }: { onCancel: () => void; onSend: (t: string) => Promise<boolean>; name: string }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        autoFocus
        rows={3}
        placeholder={`ตอบกลับ ${name}`}
        aria-label={`ตอบกลับ ${name}`}
        className={cn(inputClass, "resize-y")}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
            setBusy(true);
            await onSend(text);
            setBusy(false);
          }
        }}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="t-caption tnum mr-auto text-text-2">{text.length}/1,000</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          ยกเลิก
        </Button>
        <Button
          variant="inverse"
          size="sm"
          disabled={!text.trim() || busy}
          onClick={async () => {
            setBusy(true);
            await onSend(text);
            setBusy(false);
          }}
        >
          ตอบกลับ
        </Button>
      </div>
    </div>
  );
}
