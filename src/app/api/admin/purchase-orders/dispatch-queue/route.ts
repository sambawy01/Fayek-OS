import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import { listDispatchQueue, getPurchaseOrder, type PurchaseOrderDetail } from "@/lib/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/purchase-orders/dispatch-queue — POs Finance has sent to the
 * warehouse for dispatch to the client (with lines). Visible to the warehouse
 * (Inventory) and Finance (Owner/Admin).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(session.role, "sales.po.dispatch") && !can(session.role, "sales.po.process")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const queue = await listDispatchQueue();
  const detailed = (await Promise.all(queue.map((p) => getPurchaseOrder(p.id)))).filter(
    (p): p is PurchaseOrderDetail => p !== null
  );
  return NextResponse.json({ purchaseOrders: detailed });
}
