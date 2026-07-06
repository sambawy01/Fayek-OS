import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import { getPurchaseOrder } from "@/lib/sales";
import { renderDispatchPdf } from "@/lib/dispatch-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/purchase-orders/[id]/dispatch-pdf — the OUTBOUND client
 * dispatch order (delivery note) for a PO, generated from Inventory. Linked to
 * the PO. Visible to the warehouse (Inventory) and Finance (Owner/Admin).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(session.role, "sales.po.dispatch") && !can(session.role, "sales.po.process")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const po = await getPurchaseOrder(Number((await params).id));
  if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const pdf = await renderDispatchPdf({
    batchId: po.id,
    docNo: `DN-${String(po.id).padStart(4, "0")}`,
    reference: "",
    supplier: "",
    fromOverride: "Fayek Abrasives — Warehouse",
    toOverride: po.companyName || "Client",
    toLine2: "Customer delivery",
    metaThird: ["Linked PO", `PO-${po.id}`],
    intro:
      "The following goods have been dispatched from our warehouse for delivery to the customer named above. Please verify the quantities and sign on receipt.",
    receivedByLabel: "Received by (client)",
    status: "",
    dispatchedAt: "",
    notes: po.notes,
    lines: po.lines.map((l) => ({ code: l.slug, name: l.name, qty: l.qty })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="dispatch-note-DN-${po.id}.pdf"`,
    },
  });
}
