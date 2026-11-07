import { redirect } from "next/navigation";

/** Old address: purchases moved up to the "สินค้าของฉัน" hub tab (/owned), which also lists freebies and samples. */
export default function LibraryPurchasesPage() {
  redirect("/owned");
}
