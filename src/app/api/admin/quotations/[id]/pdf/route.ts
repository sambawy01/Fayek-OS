import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getQuotation } from "@/lib/sales";
import { renderQuotationPdf } from "@/lib/quotation-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("sales.quote");
  if ("error" in guard) return guard.error;
  const q = await getQuotation(Number((await params).id));
  if (!q) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const pdf = await renderQuotationPdf({
    quotationId: q.id,
    companyName: q.companyName,
    lines: q.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceEgp: l.unitPriceEgp })),
    totalEgp: q.totalEgp,
    validUntil: q.validUntil,
    notes: q.notes,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quotation-Q-${q.id}.pdf"`,
    },
  });
}
