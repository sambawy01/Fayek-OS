import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import { getCatalog, type Product } from "@/lib/catalog";
import PosClient from "./pos-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store POS — Fayek Abrasives",
  robots: { index: false, follow: false },
};

/**
 * /admin/pos — in-store point-of-sale. Requires a session (enforced by the
 * proxy) and the `pos.sell` capability (owner / admin / sales).
 */
export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin/pos");
  if (!can(session.role, "pos.sell")) redirect("/admin");

  let products: Product[] = [];
  try {
    products = (await getCatalog()).filter((p) => p.active);
  } catch {
    products = [];
  }

  return <PosClient products={products} adminKey="" />;
}
