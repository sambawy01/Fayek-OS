import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { decideProductionOrder, setProductionStatus } from "@/lib/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/production-orders/[id]
 *  - { action: "approve" | "reject", note? }  → Owner/Admin decision (production.manage)
 *  - { action: "start" | "done" }             → factory advances status (production.view)
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

  if (action === "start" || action === "done") {
    const guard = await requireCapability("production.view");
    if ("error" in guard) return guard.error;
    const order = await setProductionStatus(id, action === "start" ? "in_production" : "done");
    if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ order });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
