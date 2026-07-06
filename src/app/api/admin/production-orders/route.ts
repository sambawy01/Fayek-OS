import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { listProductionOrders, createProductionOrder, type ProductionStatus } from "@/lib/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ProductionStatus[] = ["pending_approval", "approved", "in_production", "done", "rejected", "cancelled"];

/** GET /api/admin/production-orders?status=… — factory production orders. */
export async function GET(request: Request) {
  const guard = await requireCapability("production.view");
  if ("error" in guard) return guard.error;
  const s = new URL(request.url).searchParams.get("status");
  const status = s && (VALID as string[]).includes(s) ? (s as ProductionStatus) : undefined;
  return NextResponse.json({ orders: await listProductionOrders(status) });
}

/** POST /api/admin/production-orders { slug, name, qty, note? } — manual create. */
export async function POST(request: Request) {
  const guard = await requireCapability("production.manage");
  if ("error" in guard) return guard.error;
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* empty */ }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const qty = typeof body.qty === "number" ? Math.round(body.qty) : NaN;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!slug || !(qty > 0)) {
    return NextResponse.json({ error: "Pick a product and a quantity (more than 0)." }, { status: 400 });
  }
  const order = await createProductionOrder({ slug, name, qty, reason: "manual", note }, guard.user.uid);
  if (!order) {
    return NextResponse.json({ error: "This product already has an open production order." }, { status: 409 });
  }
  return NextResponse.json({ order });
}
