import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getReceivable, recordPayment } from "@/lib/receivables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;
  const rec = await getReceivable(Number((await params).id));
  if (!rec) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ receivable: rec });
}

/** POST — record a payment against the receivable. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const amount = typeof body.amountEgp === "number" ? Math.round(body.amountEgp) : 0;
  if (!(amount > 0)) {
    return NextResponse.json({ error: "Enter a positive amount." }, { status: 400 });
  }
  const proofUrl = typeof body.proofUrl === "string" ? body.proofUrl.trim() : "";
  if (!proofUrl) {
    return NextResponse.json({ error: "Attach a proof of payment before recording." }, { status: 400 });
  }
  const rec = await recordPayment(
    id,
    {
      amountEgp: amount,
      method: typeof body.method === "string" ? body.method : "bank_transfer",
      note: typeof body.note === "string" ? body.note.trim().slice(0, 300) : "",
      proofUrl,
    },
    guard.user.uid
  );
  if (!rec) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ receivable: rec });
}
