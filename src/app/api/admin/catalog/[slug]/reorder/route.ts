import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/admin/catalog/[slug]/reorder — set a product's reorder settings:
 * { reorderPoint?, reorderQty?, frequentSupply? }. Inventory planning, so
 * catalog.editStock (owner/admin/inventory). Directly updates the row (these are
 * settings, not on-hand stock — which still needs owner approval).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const guard = await requireCapability("catalog.editStock");
  if ("error" in guard) return guard.error;
  const slug = decodeURIComponent((await params).slug);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const b = body as { reorderPoint?: unknown; reorderQty?: unknown; frequentSupply?: unknown };

  const point = typeof b.reorderPoint === "number" && Number.isFinite(b.reorderPoint) ? Math.max(0, Math.round(b.reorderPoint)) : null;
  const qty = typeof b.reorderQty === "number" && Number.isFinite(b.reorderQty) ? Math.max(1, Math.round(b.reorderQty)) : null;
  const freq = typeof b.frequentSupply === "boolean" ? b.frequentSupply : null;
  if (point === null && qty === null && freq === null) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const rows = (await db()`
    UPDATE products SET
      reorder_point   = COALESCE(${point}, reorder_point),
      reorder_qty     = COALESCE(${qty}, reorder_qty),
      frequent_supply = COALESCE(${freq}, frequent_supply),
      updated_at = now()
    WHERE slug = ${slug}
    RETURNING slug, reorder_point, reorder_qty, frequent_supply
  `) as { slug: string; reorder_point: number; reorder_qty: number; frequent_supply: boolean }[];
  if (!rows[0]) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({
    ok: true,
    reorderPoint: Number(rows[0].reorder_point),
    reorderQty: Number(rows[0].reorder_qty),
    frequentSupply: Boolean(rows[0].frequent_supply),
  });
}
