import { FreebieCard } from "@/components/free/freebie-card";
import type { FreebiePublic } from "@/lib/freebies";
import { Row } from "./row";
import { ROW_W } from "./sizes";

/** "ของฟรี": published freebies (pinned first). Renders nothing when there are none. Items come from the page's parallel fetch. */
export function FreebiesRow({ title = "ของฟรี", items }: { title?: string; items: FreebiePublic[] }) {
  if (!items.length) return null;
  return (
    <Row title={title} href="/free" itemClass={ROW_W.product}>
      {items.map((f) => (
        <FreebieCard key={f.id} item={f} />
      ))}
    </Row>
  );
}
