"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { ImagePlus, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { useOptionalViewer, useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { createPostAction, signCommunityUploadsAction } from "@/app/community-actions";
import { ACCEPT_IMAGES, prepareImage, putImage, type PreparedImage } from "@/lib/client/images";
import { POST_LIMITS, type PostView } from "@/lib/community";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Picked {
  id: string;
  preview: string;
  img: PreparedImage | null; // null while the image is still being resized
}

type ComposerViewer = { display_name: string; avatar_url: string | null; is_member: boolean; is_banned?: boolean };

/**
 * Post box at the top of the feed (anyone signed in; images are members-only) — also used by the Studio "โพสต์รูป" composer, which has no
 * site provider, so it passes `asViewer`.
 */
export function PostComposer({
  onPosted,
  asViewer,
  placeholder = "เล่าอะไรให้ชุมชนฟังหน่อย…",
  className,
}: {
  onPosted: (p: PostView) => void;
  asViewer?: { display_name: string; avatar_url: string | null };
  placeholder?: string;
  className?: string;
}) {
  const ctx = useOptionalViewer();
  const viewer: ComposerViewer | null = ctx ? ctx.viewer : asViewer ? { ...asViewer, is_member: true } : null;
  if (!viewer) return <GuestBox className={className} />;
  if (viewer.is_banned) return null;
  return <ComposerBox viewer={viewer} onPosted={onPosted} placeholder={placeholder} className={className} />;
}

/** Guests go straight to /login (and back here after) — no extra sign-in modal in between. */
function GuestBox({ className }: { className?: string }) {
  const pathname = usePathname();
  const href = `/login?next=${encodeURIComponent(pathname || "/community")}`;
  return (
    <div className={cn("flex items-center gap-3 rounded-[16px] border border-border bg-surface p-4", className)}>
      <Avatar name="?" size={40} />
      <Link href={href} className="flex-1 text-left text-[14px] text-text-2">
        เข้าสู่ระบบเพื่อร่วมคุยในชุมชน…
      </Link>
      <Button asChild variant="inverse" size="sm">
        <Link href={href}>เข้าสู่ระบบ</Link>
      </Button>
    </div>
  );
}

function ComposerBox({ viewer, onPosted, placeholder, className }: { viewer: ComposerViewer; onPosted: (p: PostView) => void; placeholder: string; className?: string }) {
  const [text, setText] = React.useState("");
  const [picked, setPicked] = React.useState<Picked[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const subscribeHref = useSubscribeHref();
  const canImages = viewer.is_member;
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const previews = React.useRef<string[]>([]);

  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 320)}px`;
  }, [text]);
  React.useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addFiles = async (files: File[]) => {
    if (!canImages) return toast("แนบรูปได้เฉพาะสมาชิก — พิมพ์ข้อความโพสต์ได้เลย");
    const room = POST_LIMITS.images - picked.length;
    if (room <= 0) return toast(`แนบรูปได้ไม่เกิน ${POST_LIMITS.images} รูป`);
    const take = files.filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (files.length > take.length && take.length === room) toast(`แนบรูปได้ไม่เกิน ${POST_LIMITS.images} รูป`);
    const fresh: Picked[] = take.map((f) => {
      const preview = URL.createObjectURL(f);
      previews.current.push(preview);
      return { id: crypto.randomUUID(), preview, img: null };
    });
    setPicked((xs) => [...xs, ...fresh]);
    await Promise.all(
      take.map(async (f, i) => {
        try {
          const img = await prepareImage(f);
          setPicked((xs) => xs.map((x) => (x.id === fresh[i].id ? { ...x, img } : x)));
        } catch (e) {
          toast(e instanceof Error ? e.message : "เพิ่มรูปไม่ได้");
          setPicked((xs) => xs.filter((x) => x.id !== fresh[i].id));
        }
      }),
    );
  };

  const processing = picked.some((p) => !p.img);
  const over = text.length > POST_LIMITS.caption;
  const canPost = (text.trim().length > 0 || picked.length > 0) && !over && !processing && !busy;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      let urls: string[] = [];
      if (picked.length) {
        const signed = await signCommunityUploadsAction(picked.map((p) => p.img!.contentType));
        if (!signed.ok) throw new Error(signed.error);
        await Promise.all(picked.map((p, i) => putImage(signed.data[i].uploadUrl, p.img!)));
        urls = signed.data.map((s) => s.publicUrl);
      }
      const r = await createPostAction(text, urls);
      if (!r.ok) throw new Error(r.error);
      posthog.capture("community_post_created", {
        has_images: urls.length > 0,
        image_count: urls.length,
      });
      onPosted(r.data);
      setText("");
      setPicked([]);
      toast("โพสต์แล้ว");
    } catch (e) {
      toast(e instanceof Error ? e.message : "โพสต์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn("rounded-[16px] border bg-surface p-4 transition-colors", dragging ? "border-accent" : "border-border", className)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="flex gap-3">
        <Avatar src={viewer.avatar_url} name={viewer.display_name} size={40} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={areaRef}
            value={text}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length && canImages) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder={placeholder}
            aria-label="เขียนโพสต์"
            disabled={busy}
            className="w-full resize-none bg-transparent pt-2 text-[15px] leading-6 outline-none placeholder:text-text-2"
          />
          {picked.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="รูปที่แนบ">
              {picked.map((p) => (
                <li key={p.id} className="relative aspect-square overflow-hidden rounded-[10px] bg-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="size-full object-cover" />
                  {!p.img && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="size-5 animate-spin text-white" />
                    </span>
                  )}
                  {!busy && (
                    <button
                      onClick={() => setPicked((xs) => xs.filter((x) => x.id !== p.id))}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                      aria-label="เอารูปออก"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_IMAGES}
              multiple
              hidden
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            {canImages ? (
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={busy || picked.length >= POST_LIMITS.images}>
                <ImagePlus /> รูปภาพ
                {picked.length > 0 && <span className="tnum text-text-2">{picked.length}/{POST_LIMITS.images}</span>}
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm" title="แนบรูปได้เฉพาะสมาชิก">
                <Link href={subscribeHref}>
                  <Lock className="text-member" /> รูปภาพ <span className="text-member">สมาชิก</span>
                </Link>
              </Button>
            )}
            {text.length > POST_LIMITS.caption * 0.8 && (
              <span className={cn("t-caption tnum", over ? "text-danger" : "text-text-2")}>
                {formatNumber(text.length)}/{formatNumber(POST_LIMITS.caption)}
              </span>
            )}
            <Button variant="primary" size="sm" className="ml-auto" onClick={submit} disabled={!canPost}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" /> กำลังโพสต์
                </>
              ) : (
                "โพสต์"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
