import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AtSign, BadgeCheck, ExternalLink, Globe, Headphones, MessageCircle, SquarePlay } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { countContent, siteSettings } from "@/lib/server/queries";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { excerpt } from "@/lib/richtext";
import { LEGAL_LINKS } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  const s = await siteSettings();
  // The about text says what the channel is; the tagline is a slogan and reads badly as a search snippet.
  const description = excerpt(s.about, 160) || s.tagline;
  return {
    title: "เกี่ยวกับช่อง",
    description,
    openGraph: { title: s.channel_name, description, images: s.banner_url ? [s.banner_url] : undefined },
  };
}

export default async function AboutPage() {
  const s = await siteSettings();
  const viewer = await getViewer();
  const counts = [
    { label: "วิดีโอ", n: await countContent("video"), Icon: SquarePlay },
    { label: "พอดแคสต์", n: await countContent("podcast"), Icon: Headphones },
  ];
  const socials = s.socials.filter((x) => /^https?:\/\//i.test(x.url));
  const membership = "/membership?from=%2Fabout";
  const subscribeHref = membership;
  const showSubscribe = !viewer?.is_member;

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      {/* Banner */}
      <div className="relative aspect-[3/1] overflow-hidden rounded-[16px] bg-surface sm:aspect-[4/1] xl:aspect-[5/1]">
        {s.banner_url && <Image src={s.banner_url} alt="" fill priority sizes="(max-width:1800px) 100vw, 1800px" className="object-cover" />}
      </div>

      {/* Identity */}
      <header className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 pt-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        <span className="relative size-[104px] shrink-0 overflow-hidden rounded-full border border-border bg-surface sm:size-[128px]">
          {s.avatar_url && <Image src={s.avatar_url} alt={`รูปโปรไฟล์ ${s.channel_name}`} fill sizes="128px" className="object-cover" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="t-display inline-flex items-center gap-2">
            {s.channel_name || "TOPJ_GRIND"}
            <BadgeCheck className="size-7 shrink-0 text-text-2" strokeWidth={1.75} aria-label="บัญชียืนยันแล้ว" role="img" />
          </h1>
          {s.tagline && <p className="mt-1 text-[17px] text-text-2">{s.tagline}</p>}
          <p className="t-meta tnum mt-2">
            {counts.map((c, i) => (
              <span key={c.label}>
                {i > 0 && " · "}
                {c.label} {formatNumber(c.n)} รายการ
              </span>
            ))}
          </p>
        </div>
        {showSubscribe && (
          <Button asChild variant="member" size="lg" className="shrink-0">
            <Link href={subscribeHref}>สมัครสมาชิก</Link>
          </Button>
        )}
      </header>

      <div className="mx-auto mt-10 grid max-w-[1100px] gap-6 lg:grid-cols-[1fr_340px]">
        {/* About text — plain text, line breaks preserved */}
        <section className="rounded-[16px] border border-border bg-surface p-6 sm:p-8" aria-labelledby="about-h">
          <h2 id="about-h" className="t-h2">
            เกี่ยวกับ
          </h2>
          <p className="mt-4 whitespace-pre-line break-words text-[15px] leading-[26px]">{s.about}</p>
        </section>

        <div className="space-y-6">
          {/* Stats */}
          <section className="rounded-[16px] border border-border bg-surface p-6" aria-labelledby="stats-h">
            <h2 id="stats-h" className="t-h2">
              คอนเทนต์ในช่อง
            </h2>
            <ul className="mt-4 space-y-3">
              {counts.map(({ label, n, Icon }) => (
                <li key={label} className="flex items-center gap-3 text-[15px]">
                  <Icon className="size-5 text-text-2" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{label}</span>
                  <span className="tnum font-semibold">{formatNumber(n)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Socials */}
          {socials.length > 0 && (
            <section className="rounded-[16px] border border-border bg-surface p-6" aria-labelledby="links-h">
              <h2 id="links-h" className="t-h2">
                ติดตาม JR
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-2">
                {socials.map((x) => (
                  <li key={x.key + x.url}>
                    <a
                      href={x.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex h-11 items-center gap-2.5 rounded-full border border-border px-4 text-[14px] font-medium transition-colors hover:bg-hover"
                      aria-label={`${x.label} (เปิดในแท็บใหม่)`}
                    >
                      <SocialIcon k={x.key} />
                      <span className="truncate">{x.label}</span>
                      <ExternalLink className="ml-auto size-3.5 shrink-0 text-text-2" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <nav className="mx-auto mt-12 flex max-w-[1100px] flex-wrap gap-x-5 gap-y-2 border-t border-border pb-10 pt-6 text-[13px]" aria-label="นโยบาย">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-text-2 underline-offset-4 hover:text-text hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Tiny brand glyphs (lucide v1 has no brand icons). */
function SocialIcon({ k }: { k: string }) {
  const cls = "size-[18px] shrink-0";
  switch (k) {
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="currentColor">
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="currentColor">
          <path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.4 6.4 0 1 0 5.4 6.3V8.6a8 8 0 0 0 4.4 1.4V6.6a4.6 4.6 0 0 1-4.4-4.6z" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="currentColor">
          <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
        </svg>
      );
    case "threads":
      return <AtSign className={cls} strokeWidth={2} aria-hidden />;
    case "line":
      return <MessageCircle className={cls} strokeWidth={2} aria-hidden />;
    default:
      return <Globe className={cls} strokeWidth={1.75} aria-hidden />;
  }
}
