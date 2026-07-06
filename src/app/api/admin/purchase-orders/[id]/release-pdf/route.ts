import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session-server";
import { can } from "@/lib/auth/roles";
import { getPurchaseOrder } from "@/lib/sales";
import { renderDispatchPdf } from "@/lib/dispatch-pdf";
import { fmtDate } from "@/lib/pdf-brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/purchase-orders/[id]/release-pdf — the PRODUCT RELEASE FORM.
 * Finance's formal authorization releasing an invoiced PO's goods to the
 * warehouse/inventory for dispatch to the client. Issued by Finance
 * (Owner/Admin) and read by the warehouse (Inventory).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(session.role, "sales.po.process") && !can(session.role, "sales.po.dispatch")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const po = await getPurchaseOrder(Number((await params).id));
  if (!po) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!po.dispatchRequested) {
    return NextResponse.json({ error: "This PO has not been released to the warehouse yet." }, { status: 409 });
  }

  const prfNo = `PRF-${String(po.id).padStart(4, "0")}`;
  const released = po.dispatchReleasedAt ? new Date(po.dispatchReleasedAt) : new Date();

  const pdf = await renderDispatchPdf({
    batchId: po.id,
    title: "PRODUCT RELEASE FORM",
    docNo: prfNo,
    metaRows: [
      ["Release No.", prfNo],
      ["Date", fmtDate(released)],
      ["Linked PO", `PO-${po.id}`],
      ["Invoice", po.receivableId ? `#${po.receivableId}` : "—"],
    ],
    reference: "",
    supplier: "",
    fromOverride: "Fayek Abrasives — Finance",
    toOverride: "Warehouse / Inventory",
    toLine2: `For delivery to ${po.companyName}`,
    intro:
      "Finance authorizes the release of the goods listed below from stock to the warehouse for dispatch to the client named above. The warehouse confirms receipt and dispatches to the client.",
    qtyLabel: "QTY RELEASED",
    dispatchedByLabel: po.releasedByName ? `Released by (Finance) — ${po.releasedByName}` : "Released by (Finance)",
    receivedByLabel: "Received by (Warehouse)",
    status: "",
    dispatchedAt: po.dispatchReleasedAt ?? "",
    notes: po.dispatchReleaseNote,
    lines: po.lines.map((l) => ({ code: l.slug, name: l.name, qty: l.qty })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="product-release-${prfNo}.pdf"`,
    },
  });
}
