import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { createQuotation, listQuotations, type SalesLine } from "@/lib/sales";
import { getCatalog } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireCapability("sales.quote");
  if ("error" in guard) return guard.error;
  return NextResponse.json({ quotations: await listQuotations() });
}

/** Body: { companyId?, companyName, validUntil?, notes?, lines:[{slug, qty, unitPriceEgp}] } */
export async function POST(request: Request) {
  const guard = await requireCapability("sales.quote");
  if ("error" in guard) return guard.error;
  const parsed = await parseSalesBody(request);
  if ("error" in parsed) return parsed.error;
  const q = await createQuotation(
    {
      companyId: parsed.companyId,
      companyName: parsed.companyName,
      validUntil: parsed.validUntil,
      notes: parsed.notes,
      lines: parsed.lines,
    },
    guard.user.uid
  );
  return NextResponse.json({ quotation: q }, { status: 201 });
}

/** Shared parse+validate for quotations and POs. */
export async function parseSalesBody(
  request: Request
): Promise<
  | { error: NextResponse }
  | { companyId: number | null; companyName: string; validUntil: string | null; notes: string; lines: SalesLine[] }
> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { error: NextResponse.json({ error: "Invalid request." }, { status: 400 }) };
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const companyName = str(body.companyName);
  const companyId = typeof body.companyId === "number" ? body.companyId : null;
  if (!companyName && companyId === null) {
    return { error: NextResponse.json({ error: "Pick a customer." }, { status: 400 }) };
  }
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) {
    return { error: NextResponse.json({ error: "Add at least one line." }, { status: 400 }) };
  }
  const catalog = await getCatalog();
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const lines: SalesLine[] = [];
  for (const raw of rawLines) {
    const r = raw as { slug?: unknown; qty?: unknown; unitPriceEgp?: unknown };
    const slug = str(r.slug);
    const product = bySlug.get(slug);
    const qty = typeof r.qty === "number" ? Math.round(r.qty) : 0;
    if (!product) {
      return { error: NextResponse.json({ error: `Unknown product: ${slug}` }, { status: 400 }) };
    }
    if (!(qty > 0)) {
      return { error: NextResponse.json({ error: `"${product.en.name}" needs a quantity.` }, { status: 400 }) };
    }
    const unitPrice =
      typeof r.unitPriceEgp === "number" && r.unitPriceEgp >= 0 ? Math.round(r.unitPriceEgp) : product.priceEgp;
    lines.push({ slug, name: product.en.name, qty, unitPriceEgp: unitPrice });
  }
  return {
    companyId,
    companyName,
    validUntil: str(body.validUntil) || null,
    notes: str(body.notes),
    lines,
  };
}
