import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import {
  getPurchaseOrder,
  fulfilPurchaseOrder,
  invoicePurchaseOrder,
} from "@/lib/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!can(session?.role, "sales.po.create")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const po = await getPurchaseOrder(Number((await params).id));
  if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ purchaseOrder: po });
}

/**
 * POST — process an open PO. Owner/Admin only (sales.po.process).
 * Body: { action: "fulfil" } → deduct stock.
 *       { action: "invoice", advanceEgp?, advanceMethod?, installmentCount?, dueDate?, firstDueDate? }
 *         → raise a receivable and link it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(session.role, "sales.po.process")) {
    return NextResponse.json(
      { error: "Only Owner/Admin can process purchase orders." },
      { status: 403 }
    );
  }
  const id = Number((await params).id);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.action === "fulfil") {
    const po = await fulfilPurchaseOrder(id);
    if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ purchaseOrder: po });
  }
  if (body.action === "invoice") {
    const num = (v: unknown) => (typeof v === "number" ? Math.round(v) : 0);
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const installments = Array.isArray(body.installments)
      ? (body.installments as unknown[])
          .map((r) => {
            const o = r as { amountEgp?: unknown; dueDate?: unknown };
            return { amountEgp: num(o.amountEgp), dueDate: typeof o.dueDate === "string" && o.dueDate ? o.dueDate : null };
          })
          .filter((x) => x.amountEgp > 0)
      : undefined;
    const po = await invoicePurchaseOrder(
      id,
      {
        advanceEgp: num(body.advanceEgp),
        advanceMethod: str(body.advanceMethod) || "cash",
        installments: installments && installments.length > 0 ? installments : undefined,
        installmentCount: num(body.installmentCount) || undefined,
        dueDate: str(body.dueDate) || null,
        firstDueDate: str(body.firstDueDate) || null,
      },
      session.uid
    );
    if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ purchaseOrder: po });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
