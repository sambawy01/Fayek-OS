import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { createBatch, listBatches } from "@/lib/batches";
import { getCatalog } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/batches         — list factory batches (batches.view).
 * POST /api/admin/batches         — declare a dispatch (batches.create: owner/admin).
 * Body: { reference, supplier, notes, lines: [{ slug, expectedQty }] }.
 */
export async function GET() {
  const guard = await requireCapability("batches.view");
  if ("error" in guard) return guard.error;
  return NextResponse.json({ batches: await listBatches() });
}

export async function POST(request: Request) {
  const guard = await requireCapability("batches.create");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) {
    return NextResponse.json(
      { error: "Add at least one product line." },
      { status: 400 }
    );
  }

  const catalog = await getCatalog();
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const lines: { slug: string; name: string; expectedQty: number }[] = [];
  for (const raw of rawLines) {
    const r = raw as { slug?: unknown; expectedQty?: unknown };
    const slug = str(r.slug);
    const qty =
      typeof r.expectedQty === "number" ? Math.round(r.expectedQty) : NaN;
    const product = bySlug.get(slug);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${slug}` },
        { status: 400 }
      );
    }
    if (!(qty > 0)) {
      return NextResponse.json(
        { error: `"${product.en.name}" needs a positive expected quantity.` },
        { status: 400 }
      );
    }
    lines.push({ slug, name: product.en.name, expectedQty: qty });
  }

  const batch = await createBatch(
    {
      reference: str(body.reference),
      supplier: str(body.supplier),
      notes: str(body.notes),
      lines,
    },
    guard.user.uid
  );
  return NextResponse.json({ batch }, { status: 201 });
}
