import Link from "next/link";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      art="bookmark"
      title="ไม่พบบทความนี้"
      body="บทความอาจถูกย้ายหรือยังไม่เผยแพร่"
      action={
        <Button asChild variant="inverse">
          <Link href="/community/articles">ดูบทความทั้งหมด</Link>
        </Button>
      }
    />
  );
}
