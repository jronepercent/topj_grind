import { PageHeader } from "@/components/studio/ui";
import { ArticleEditor } from "@/components/studio/article-editor";

export const metadata = { title: "บทความใหม่" };

export default function NewArticlePage() {
  return (
    <div>
      <PageHeader title="บทความใหม่" />
      <ArticleEditor />
    </div>
  );
}
