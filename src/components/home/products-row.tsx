import { featuredProducts } from "@/lib/server/shop";
import { ProductCard } from "@/components/shop/product-card";
import { Row } from "./row";
import { ROW_W } from "./sizes";

/** "สินค้าแนะนำ": featured shop products. Renders nothing when there are none (or the shop tables are not migrated). */
export async function ProductsRow({ title = "สินค้าแนะนำ", userId }: { title?: string; userId?: string | null }) {
  const products = await featuredProducts(12, userId).catch(() => []);
  if (!products.length) return null;
  return (
    <Row title={title} href="/shop" itemClass={ROW_W.product}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} variant="row" />
      ))}
    </Row>
  );
}
