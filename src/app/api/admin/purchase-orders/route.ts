import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/sales";
import { parseSalesBody } from "../quotations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireCapability("sales.po.create");
  if ("error" in guard) return guard.error;
  const openOnly = new URL(request.url).searchParams.get("open") === "1";
  return NextResponse.json({ purchaseOrders: await listPurchaseOrders(openOnly) });
}

/** Body: { companyId?, companyName, notes?, quotationId?, lines:[{slug, qty, unitPriceEgp}] } */
export async function POST(request: Request) {
  const guard = await requireCapability("sales.po.create");
  if ("error" in guard) return guard.error;
  const cloned = request.clone();
  const parsed = await parseSalesBody(request);
  if ("error" in parsed) return parsed.error;
  let quotationId: number | null = null;
  try {
    const b = (await cloned.json()) as { quotationId?: unknown };
    if (typeof b.quotationId === "number") quotationId = b.quotationId;
  } catch {
    /* ignore */
  }
  const po = await createPurchaseOrder(
    {
      companyId: parsed.companyId,
      companyName: parsed.companyName,
      quotationId,
      notes: parsed.notes,
      lines: parsed.lines,
    },
    guard.user.uid
  );
  return NextResponse.json({ purchaseOrder: po }, { status: 201 });
}
