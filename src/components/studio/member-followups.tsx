"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { markFollowupAction } from "@/app/studio/actions";
import { formatNumber } from "@/lib/format";
import { Card, CardHeader } from "./ui";
import type { FollowupGroup, FollowupKind } from "./types";

const LIMIT = 5;

/** "ต้องทำวันนี้": people to contact today, grouped by reason. */
export function MemberFollowups({ groups, available }: { groups: FollowupGroup[]; available: boolean }) {
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<Set<FollowupKind>>(new Set());

  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !gone.has(`${g.kind}:${i.id}`)) }))
    .filter((g) => g.items.length > 0);
  const total = visible.reduce((s, g) => s + g.items.length, 0);

  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast("คัดลอกอีเมลแล้ว");
    } catch {
      toast("คัดลอกไม่สำเร็จ");
    }
  };

  const mark = async (kind: FollowupKind, id: string) => {
    const key = `${kind}:${id}`;
    setGone((s) => new Set(s).add(key));
    const r = await markFollowupAction(id, kind);
    if (!r.ok) {
      setGone((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
      toast(r.error);
    }
  };

  return (
    <Card>
      <CardHeader title={`ต้องทำวันนี้${total ? ` (${formatNumber(total)})` : ""}`} description="คนที่ควรทักหรือตามวันนี้ กด “ทักแล้ว” เพื่อซ่อนไว้ 7 วัน" />
      {!available && <p className="t-caption px-5 pt-2 text-text-2">ยังไม่ได้ apply migration 0022 — ปุ่มทักแล้วจะยังไม่ทำงาน</p>}
      {visible.length === 0 ? (
        <p className="t-meta px-5 pb-5 pt-3">วันนี้ไม่มีใครต้องตาม 🎉</p>
      ) : (
        <div className="space-y-5 px-5 pb-5 pt-3">
          {visible.map((g) => {
            const expanded = open.has(g.kind);
            const shown = expanded ? g.items : g.items.slice(0, LIMIT);
            return (
              <section key={g.kind} aria-label={g.title}>
                <h3 className="text-[14px] font-semibold">
                  {g.title} <span className="tnum font-normal text-text-2">· {formatNumber(g.items.length)} คน</span>
                </h3>
                <p className="t-caption text-text-2">{g.hint}</p>
                <ul className="mt-1">
                  {shown.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                      <Avatar src={i.avatar_url} name={i.display_name} size={32} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/studio/members/${i.id}`} className="block truncate text-[13px] font-medium hover:underline">
                          {i.display_name}
                        </Link>
                        <p className="t-caption truncate text-text-2">{i.reason}</p>
                      </div>
                      {i.email && (
                        <Button size="sm" variant="ghost" aria-label={`คัดลอกอีเมล ${i.display_name}`} title="คัดลอกอีเมล" onClick={() => copy(i.email)}>
                          <Copy />
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" className="shrink-0" onClick={() => mark(g.kind, i.id)}>
                        ทักแล้ว ✓
                      </Button>
                    </li>
                  ))}
                </ul>
                {g.items.length > LIMIT &&
                  (g.kind === "hot" ? (
                    <Link href="/studio/members/list?seg=hot" className="t-meta mt-2 inline-block hover:text-text">
                      ดูทั้งหมด {formatNumber(g.items.length)} คน
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="t-meta mt-2 hover:text-text"
                      onClick={() =>
                        setOpen((s) => {
                          const next = new Set(s);
                          if (next.has(g.kind)) next.delete(g.kind);
                          else next.add(g.kind);
                          return next;
                        })
                      }
                    >
                      {expanded ? "ย่อรายชื่อ" : `ดูทั้งหมด ${formatNumber(g.items.length)} คน`}
                    </button>
                  ))}
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}
