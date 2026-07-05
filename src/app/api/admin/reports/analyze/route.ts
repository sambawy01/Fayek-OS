import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { recommend } from "@/lib/ai-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reports/analyze — AI analysis of a report (reports.view).
 * Body: { kind, data }. Returns { analysis } (fails soft to a friendly note).
 */
export async function POST(request: Request) {
  const guard = await requireCapability("reports.view");
  if ("error" in guard) return guard.error;

  let body: { kind?: unknown; data?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const kind = typeof body.kind === "string" ? body.kind : "report";

  const system =
    "You are the business analyst for Fayek Abrasives, an industrial abrasives " +
    "and filtration supplier in Cairo, Egypt. Analyse the report data and give " +
    "the Owner 3–5 short, concrete bullet points: what stands out, risks, and a " +
    "recommended next action. Currency is EGP.";
  const question = `Report: ${kind}\nData (JSON):\n${JSON.stringify(body.data, null, 1)}`;

  const analysis = await recommend(system, question);
  return NextResponse.json({
    analysis:
      analysis ||
      "AI analysis unavailable — set OLLAMA_API_KEY on the deployment to enable it.",
  });
}
