import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import { getPurchaseOrder } from "@/lib/sales";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/purchase-orders/[id]/invoice-pdf — the customer INVOICE for an
 * invoiced PO. Finance (Owner/Admin) previews/downloads it to send the client.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(session.role, "sales.po.process")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const po = await getPurchaseOrder(Number((await params).id));
  if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!po.receivableId) {
    return NextResponse.json({ error: "Invoice this PO before generating its invoice document." }, { status: 409 });
  }

  const invoiceNo = `INV-${String(po.id).padStart(4, "0")}`;
  const pdf = await renderInvoicePdf({
    invoiceNo,
    companyName: po.companyName,
    lines: po.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceEgp: l.unitPriceEgp })),
    totalEgp: po.totalEgp,
    dueDate: po.dueDate ?? null,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoiceNo}.pdf"`,
    },
  });
}
