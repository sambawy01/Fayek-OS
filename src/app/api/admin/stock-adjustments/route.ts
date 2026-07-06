import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getCatalog } from "@/lib/catalog";
import { createApproval } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/stock-adjustments { slug, requestedQty (number|null), reason }
 * — request a change to a product's on-hand quantity. Stock can never be edited
 * directly: this raises a `stock_adjustment` approval that ONLY the Owner can
 * decide; the quantity changes only when the Owner approves.
 */
export async function POST(request: Request) {
  const guard = await requireCapability("catalog.editStock");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 400) : "";
  const requestedQty =
    body.requestedQty === null
      ? null
      : typeof body.requestedQty === "number" && Number.isInteger(body.requestedQty) && body.requestedQty >= 0
        ? body.requestedQty
        : undefined;
  if (requestedQty === undefined) {
    return NextResponse.json({ error: "Requested quantity must be a whole number ≥ 0 (or null for untracked)." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required for a stock adjustment." }, { status: 400 });
  }

  const product = (await getCatalog()).find((p) => p.slug === slug);
  if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  if (product.quantity === requestedQty) {
    return NextResponse.json({ error: "That is already the current quantity." }, { status: 400 });
  }

  const approval = await createApproval({
    type: "stock_adjustment",
    refBatchId: null,
    title: `Stock adjustment — ${product.en.name}`,
    detail: {
      slug: product.slug,
      name: product.en.name,
      currentQty: product.quantity,
      requestedQty,
      reason,
      requestedBy: guard.user.name || guard.user.username,
    },
    raisedBy: guard.user.uid,
  });
  return NextResponse.json({ approval }, { status: 201 });
}
