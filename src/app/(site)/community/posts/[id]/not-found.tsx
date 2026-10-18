import Link from "next/link";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      art="comment"
      title="ไม่พบโพสต์นี้"
      body="โพสต์อาจถูกลบ หรือต้องเข้าสู่ระบบก่อนจึงจะเห็น"
      action={
        <Button asChild variant="inverse">
          <Link href="/community">กลับไปชุมชน</Link>
        </Button>
      }
    />
  );
}
