import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { decideProductionOrder, setProductionStatus, dispatchProductionOrder } from "@/lib/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/production-orders/[id]
 *  - { action: "approve" | "reject", note? }  → Owner/Admin decision (production.manage)
 *  - { action: "start" }                      → factory begins production (production.view)
 *  - { action: "dispatch", qty }              → factory dispatches to the warehouse:
 *      creates a batch for the produced qty; a mismatch vs the order escalates to
 *      Owner/Admin. Requires batches.create.
 *  - { action: "cancel" }                     → Owner/Admin cancels (production.manage)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = Number((await params).id);
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* empty */ }
  const action = body.action;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (action === "approve" || action === "reject") {
    const guard = await requireCapability("production.manage");
    if ("error" in guard) return guard.error;
    const order = await decideProductionOrder(id, action, guard.user.uid, note);
    if (!order) return NextResponse.json({ error: "This order has already been decided." }, { status: 409 });
    return NextResponse.json({ order });
  }

  if (action === "cancel") {
    const guard = await requireCapability("production.manage");
    if ("error" in guard) return guard.error;
    const order = await setProductionStatus(id, "cancelled");
    if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ order });
  }

  if (action === "start") {
    const guard = await requireCapability("production.view");
    if ("error" in guard) return guard.error;
    const order = await setProductionStatus(id, "in_production");
    if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ order });
  }

  if (action === "dispatch") {
    const guard = await requireCapability("batches.create"); // factory / owner / admin
    if ("error" in guard) return guard.error;
    const qty = typeof body.qty === "number" ? Math.round(body.qty) : NaN;
    if (!(qty > 0)) return NextResponse.json({ error: "Enter the dispatched quantity." }, { status: 400 });
    const r = await dispatchProductionOrder(id, qty, guard.user.uid);
    if (!r.ok) {
      const msg = r.reason === "not_found" ? "Not found."
        : r.reason === "bad_status" ? "Only an approved / in-production order can be dispatched."
        : "Enter a valid dispatched quantity.";
      return NextResponse.json({ error: msg }, { status: r.reason === "not_found" ? 404 : 409 });
    }
    return NextResponse.json({ order: r.order, batchId: r.batchId, escalated: r.escalated });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
