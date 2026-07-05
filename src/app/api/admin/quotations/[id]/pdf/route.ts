import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getQuotation } from "@/lib/sales";
import { renderLetterheadPdf } from "@/lib/assistant/letterhead-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const egp = (n: number) => `${n.toLocaleString("en-EG")} EGP`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("sales.quote");
  if ("error" in guard) return guard.error;
  const q = await getQuotation(Number((await params).id));
  if (!q) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = [
    q.validUntil ? `Valid until ${q.validUntil}.` : "",
    "",
    "# Items",
    ...q.lines.map(
      (l) => `- ${l.name} — ${l.qty} × ${egp(l.unitPriceEgp)} = ${egp(l.qty * l.unitPriceEgp)}`
    ),
    "",
    `# Total: ${egp(q.totalEgp)}`,
    q.notes ? `\n${q.notes}` : "",
    "",
    "Prices in EGP. This quotation is subject to stock availability.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const { pdf } = await renderLetterheadPdf({
    title: `Quotation Q-${q.id}`,
    recipient: q.companyName || undefined,
    body,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quotation-Q-${q.id}.pdf"`,
    },
  });
}
