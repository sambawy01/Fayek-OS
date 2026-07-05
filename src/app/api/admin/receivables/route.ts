import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { listReceivables, createReceivable } from "@/lib/receivables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/receivables?open=1 — receivables (finance.view: owner/admin).
 * POST /api/admin/receivables        — create a credit sale with an optional
 *      advance and installment plan.
 */
export async function GET(request: Request) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;
  const open = new URL(request.url).searchParams.get("open") === "1";
  return NextResponse.json({ receivables: await listReceivables(open) });
}

export async function POST(request: Request) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const total = num(body.totalEgp);
  const companyName = str(body.companyName);
  if (total <= 0) {
    return NextResponse.json({ error: "Total must be a positive amount." }, { status: 400 });
  }
  if (!companyName && typeof body.companyId !== "number") {
    return NextResponse.json({ error: "Pick a customer or enter a name." }, { status: 400 });
  }
  const advanceAmount = num(body.advanceAmount);
  if (advanceAmount > total) {
    return NextResponse.json({ error: "Advance can't exceed the total." }, { status: 400 });
  }

  const rec = await createReceivable(
    {
      companyId: typeof body.companyId === "number" ? body.companyId : null,
      companyName,
      orderRef: str(body.orderRef),
      totalEgp: total,
      dueDate: str(body.dueDate) || null,
      notes: str(body.notes),
      advance: advanceAmount > 0 ? { amountEgp: advanceAmount, method: str(body.advanceMethod) || "cash" } : undefined,
      installmentCount: num(body.installmentCount) || undefined,
      firstDueDate: str(body.firstDueDate) || null,
    },
    guard.user.uid
  );
  return NextResponse.json({ receivable: rec }, { status: 201 });
}
