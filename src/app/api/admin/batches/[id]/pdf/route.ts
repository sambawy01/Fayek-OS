import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getBatch } from "@/lib/batches";
import { renderDispatchPdf } from "@/lib/dispatch-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/batches/[id]/pdf — the factory's Dispatch Order document. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("batches.view");
  if ("error" in guard) return guard.error;
  const batch = await getBatch(Number((await params).id));
  if (!batch) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const pdf = await renderDispatchPdf({
    batchId: batch.id,
    reference: batch.reference,
    supplier: batch.supplier,
    notes: batch.notes,
    status: batch.status,
    dispatchedAt: batch.dispatchedAt,
    lines: batch.lines.map((l) => ({ code: l.slug, name: l.name, qty: l.expectedQty })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="dispatch-order-DO-${batch.id}.pdf"`,
    },
  });
}
