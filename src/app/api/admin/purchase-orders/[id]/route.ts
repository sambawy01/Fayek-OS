import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import {
  getPurchaseOrder,
  fulfilPurchaseOrder,
  invoicePurchaseOrder,
  releaseToWarehouse,
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
  const id = Number((await params).id);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // "fulfil" = the warehouse CONFIRMS the client dispatch (deducts stock).
  if (body.action === "fulfil") {
    if (!can(session.role, "sales.po.dispatch")) {
      return NextResponse.json({ error: "Only the warehouse (Inventory) can confirm a client dispatch." }, { status: 403 });
    }
    const po = await fulfilPurchaseOrder(id);
    if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ purchaseOrder: po });
  }

  // Everything else (invoice, request-dispatch) is Owner/Admin (Finance).
  if (!can(session.role, "sales.po.process")) {
    return NextResponse.json({ error: "Only Owner/Admin can process purchase orders." }, { status: 403 });
  }

  // "release" = Finance issues the Product Release Form → warehouse queue.
  if (body.action === "release" || body.action === "request-dispatch") {
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const r = await releaseToWarehouse(id, note, session.uid);
    if (!r.ok) {
      const msg =
        r.reason === "not_found" ? "Not found." :
        r.reason === "not_invoiced" ? "Invoice this PO before releasing it to the warehouse." :
        "This PO has already been dispatched.";
      return NextResponse.json({ error: msg }, { status: r.reason === "not_found" ? 404 : 409 });
    }
    return NextResponse.json({ purchaseOrder: r.po });
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
    const advanceEgp = num(body.advanceEgp);
    const advanceProofUrl = str(body.advanceProofUrl);
    if (advanceEgp > 0 && !advanceProofUrl) {
      return NextResponse.json({ error: "Attach a proof of payment for the advance." }, { status: 400 });
    }
    const po = await invoicePurchaseOrder(
      id,
      {
        advanceEgp,
        advanceMethod: str(body.advanceMethod) || "bank_transfer",
        advanceProofUrl,
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
