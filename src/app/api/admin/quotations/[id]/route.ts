import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getQuotation, setQuotationStatus, type QuotationStatus } from "@/lib/sales";

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
  return NextResponse.json({ quotation: q });
}

/** PATCH { status } — draft/sent/accepted/expired. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("sales.quote");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const allowed: QuotationStatus[] = ["draft", "sent", "accepted", "expired"];
  if (!allowed.includes(body.status as QuotationStatus)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  await setQuotationStatus(id, body.status as QuotationStatus);
  return NextResponse.json({ quotation: await getQuotation(id) });
}
