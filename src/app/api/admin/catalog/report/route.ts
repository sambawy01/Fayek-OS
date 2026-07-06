import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import { getCatalog } from "@/lib/catalog";
import { renderInventoryPdf, inventoryCsv, type InventoryFilter } from "@/lib/inventory-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS: InventoryFilter[] = ["all", "tracked", "low", "out"];

/**
 * GET /api/admin/catalog/report?format=pdf|csv&filter=all|tracked|low|out
 * Point-in-time inventory list for audits. Value columns only for roles that
 * can see prices (catalog.editPrice); everyone with catalog.view gets quantities.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("catalog.view");
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const fParam = url.searchParams.get("filter");
  const filter: InventoryFilter = FILTERS.includes(fParam as InventoryFilter) ? (fParam as InventoryFilter) : "all";

  const products = await getCatalog();
  const opts = {
    filter,
    generatedBy: guard.user.name || guard.user.username,
    withValue: can(guard.user.role, "catalog.editPrice"),
  };
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = inventoryCsv(products, opts);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory-${filter}-${stamp}.csv"`,
      },
    });
  }

  const pdf = await renderInventoryPdf(products, opts);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="inventory-${filter}-${stamp}.pdf"`,
    },
  });
}
