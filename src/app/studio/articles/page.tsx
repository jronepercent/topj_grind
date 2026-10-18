import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/studio/ui";
import { ArticlesManager } from "@/components/studio/articles-manager";
import { studioArticles } from "@/lib/server/community";

export const metadata = { title: "บทความ" };

export default async function StudioArticlesPage() {
  const rows = await studioArticles();
  return (
    <div>
      <PageHeader
        title="บทความ"
        description="เขียนบทความให้สมาชิกและคนทั่วไปอ่าน ให้ AI ช่วยร่างได้ แล้วตรวจก่อนเผยแพร่"
        action={
          <Button asChild variant="inverse">
            <Link href="/studio/articles/new">
              <Plus /> เขียนบทความ
            </Link>
          </Button>
        }
      />
      <ArticlesManager rows={rows} />
    </div>
  );
}
