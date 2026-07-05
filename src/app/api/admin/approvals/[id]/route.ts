import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import {
  getApproval,
  decideApproval,
  setApprovalRecommendation,
} from "@/lib/approvals";
import { getBatch, setBatchStatus } from "@/lib/batches";
import { addQuantities } from "@/lib/catalog";
import { recommendForDiscrepancy } from "@/lib/ai-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/approvals/<id>  — decide (approvals.resolve).
 * Body: { decision: "approve" | "reject", note?, action?: "recommend" }.
 * - "recommend" → (re)generate the AI recommendation, no decision.
 * - "approve"   → accept the received quantities into stock; batch → resolved.
 * - "reject"    → no stock change; batch → rejected.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCapability("approvals.resolve");
  if ("error" in guard) return guard.error;
  const id = Number((await params).id);
  const approval = await getApproval(id);
  if (!approval) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let body: { decision?: unknown; note?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  // Regenerate AI recommendation without deciding.
  if (body.action === "recommend") {
    const rec = await recommendForDiscrepancy(
      approval.detail as Parameters<typeof recommendForDiscrepancy>[0]
    );
    if (rec) await setApprovalRecommendation(id, rec);
    return NextResponse.json({
      recommendation: rec || "AI recommendation unavailable (model not configured).",
    });
  }

  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been decided." },
      { status: 409 }
    );
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  }

  // Apply the stock/batch side effects for a batch discrepancy.
  if (approval.refBatchId) {
    const batch = await getBatch(approval.refBatchId);
    if (batch && batch.status === "pending_approval") {
      if (decision === "approve") {
        await addQuantities(
          batch.lines.map((l) => ({ slug: l.slug, qty: l.receivedQty ?? 0 }))
        );
        await setBatchStatus(batch.id, "resolved");
      } else {
        await setBatchStatus(batch.id, "rejected");
      }
    }
  }

  const updated = await decideApproval(
    id,
    guard.user.uid,
    decision === "approve" ? "approved" : "rejected",
    note
  );
  return NextResponse.json({ approval: updated });
}
