import Link from "next/link";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="ไม่พบหน้านี้"
      body="คลิปอาจถูกลบ ย้าย หรือยังไม่เผยแพร่"
      action={
        <Button asChild variant="inverse">
          <Link href="/">กลับหน้าแรก</Link>
        </Button>
      }
      className="py-24"
    />
  );
}
