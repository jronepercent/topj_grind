import { PageHeader } from "@/components/studio/ui";
import { ProductEditor } from "@/components/studio/product-editor";
import { catalog } from "@/lib/server/queries";

export const metadata = { title: "สินค้าใหม่" };

export default async function NewProductPage() {
  const playlists = (await catalog()).playlists.map((p) => ({ id: p.id, title: p.title, is_course: p.is_course }));
  return (
    <div>
      <PageHeader title="สินค้าใหม่" />
      <ProductEditor playlists={playlists} purchases={[]} />
    </div>
  );
}
