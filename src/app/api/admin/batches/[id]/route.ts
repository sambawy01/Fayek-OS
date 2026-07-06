import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getBatch, recordReceipt } from "@/lib/batches";
import { createApproval, setApprovalRecommendation } from "@/lib/approvals";
import { addQuantities } from "@/lib/catalog";
import { recommendForDiscrepancy } from "@/lib/ai-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("batches.view");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);
  const batch = await getBatch(id);
  if (!batch) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ batch });
}

/**
 * POST /api/admin/batches/<id>  — receive & count. Body: { lines: [{ lineId,
 * receivedQty }] }.
 * - No discrepancy → status "received", stock added.
 * - Any discrepancy → status "pending_approval", an approval is raised to
 *   Owner/Admin (with a best-effort AI recommendation). Stock is NOT added
 *   until the approval is accepted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("batches.receive");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);
  const batch = await getBatch(id);
  if (!batch) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (batch.status !== "dispatched") {
    return NextResponse.json(
      { error: `This batch is already ${batch.status.replace("_", " ")}.` },
      { status: 409 }
    );
  }

  let body: { lines?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as { lines?: unknown; notes?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const receiptNotes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const byLineId = new Map(batch.lines.map((l) => [l.id, l]));
  const received: { lineId: number; receivedQty: number }[] = [];
  for (const raw of rawLines) {
    const r = raw as { lineId?: unknown; receivedQty?: unknown };
    const lineId = typeof r.lineId === "number" ? r.lineId : NaN;
    const qty = typeof r.receivedQty === "number" ? Math.round(r.receivedQty) : NaN;
    if (!byLineId.has(lineId) || !(qty >= 0)) {
      return NextResponse.json(
        { error: "Each line needs a valid received quantity (0 or more)." },
        { status: 400 }
      );
    }
    received.push({ lineId, receivedQty: qty });
  }
  if (received.length !== batch.lines.length) {
    return NextResponse.json(
      { error: "Enter a received quantity for every line." },
      { status: 400 }
    );
  }

  // Diff against expected.
  const recByLine = new Map(received.map((r) => [r.lineId, r.receivedQty]));
  const diffs = batch.lines.map((l) => {
    const rec = recByLine.get(l.id) ?? 0;
    return { line: l, received: rec, diff: rec - l.expectedQty };
  });
  const hasDiscrepancy = diffs.some((d) => d.diff !== 0);

  if (!hasDiscrepancy) {
    const updated = await recordReceipt(id, guard.user.uid, received, "received", receiptNotes);
    await addQuantities(
      batch.lines.map((l) => ({ slug: l.slug, qty: recByLine.get(l.id) ?? 0 }))
    );
    return NextResponse.json({ batch: updated, outcome: "received" });
  }

  // Discrepancy → hold stock, raise an escalation.
  const updated = await recordReceipt(id, guard.user.uid, received, "pending_approval", receiptNotes);
  const detail = {
    reference: batch.reference,
    supplier: batch.supplier,
    receiptNotes,
    lines: diffs.map((d) => ({
      name: d.line.name,
      expectedQty: d.line.expectedQty,
      receivedQty: d.received,
      diff: d.diff,
    })),
  };
  const approval = await createApproval({
    type: "batch_discrepancy",
    refBatchId: id,
    title: `Batch #${id} received with a discrepancy`,
    detail,
    raisedBy: guard.user.uid,
  });
  // Best-effort AI recommendation (never blocks the escalation).
  try {
    const rec = await recommendForDiscrepancy(detail);
    if (rec) await setApprovalRecommendation(approval.id, rec);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    batch: updated,
    outcome: "pending_approval",
    approvalId: approval.id,
  });
}
