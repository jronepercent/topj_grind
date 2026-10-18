import { notFound } from "next/navigation";
import { PageHeader } from "@/components/studio/ui";
import { ProductEditor } from "@/components/studio/product-editor";
import { catalog } from "@/lib/server/queries";
import { studioProduct, studioPurchases } from "@/lib/server/shop";

export const metadata = { title: "แก้ไขสินค้า" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, purchases, cat] = await Promise.all([studioProduct(id), studioPurchases(100, id), catalog()]);
  if (!product) notFound();
  const playlists = cat.playlists.map((p) => ({ id: p.id, title: p.title, is_course: p.is_course }));
  return (
    <div>
      <PageHeader title="แก้ไขสินค้า" />
      <ProductEditor key={product.id} initial={product} playlists={playlists} purchases={purchases} />
    </div>
  );
}
