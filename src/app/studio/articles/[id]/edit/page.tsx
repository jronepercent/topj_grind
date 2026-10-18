import { notFound } from "next/navigation";
import { PageHeader } from "@/components/studio/ui";
import { ArticleEditor } from "@/components/studio/article-editor";
import { studioArticle } from "@/lib/server/community";

export const metadata = { title: "แก้ไขบทความ" };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await studioArticle(id);
  if (!article) notFound();
  return (
    <div>
      <PageHeader title="แก้ไขบทความ" />
      <ArticleEditor key={article.id} initial={article} />
    </div>
  );
}
