import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { recommend } from "@/lib/ai-recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "intro" | "followup" | "quote_cover" | "reminder";

const SIGN = "\n\nWarm regards,\nFayek Abrasives\ninfo@ftc-eg.com · +20 2 2415 6092";

const TEMPLATES: Record<Kind, { subject: string; body: (c: string) => string }> = {
  intro: {
    subject: "Introduction — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nI'm reaching out from Fayek Abrasives, an industrial abrasives and filtration supplier in Cairo (since 1997). We'd be glad to support your operations with quality, cost-oriented products tailored to your specifications.\n\nMay I send our catalogue or prepare a quotation for your requirements?${SIGN}`,
  },
  followup: {
    subject: "Following up — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nJust following up on my previous message. I'd be happy to answer any questions or put together a quotation whenever it's convenient.\n\nLooking forward to hearing from you.${SIGN}`,
  },
  quote_cover: {
    subject: "Your quotation — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nPlease find attached our quotation for your requirements. Prices are in EGP and subject to stock availability. Do let me know if you'd like any adjustments to quantities or specifications.\n\nWe look forward to serving you.${SIGN}`,
  },
  reminder: {
    subject: "Payment reminder — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nA gentle reminder regarding the outstanding balance on your account. Please let me know if you need the invoice details or wish to arrange payment.\n\nThank you for your business.${SIGN}`,
  },
};

/** POST { kind, customerName, context?, personalize? } → { subject, body }. */
export async function POST(request: Request) {
  const guard = await requireCapability("outreach.use");
  if ("error" in guard) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const kind = body.kind as Kind;
  if (!TEMPLATES[kind]) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }
  const customer =
    typeof body.customerName === "string" && body.customerName.trim()
      ? body.customerName.trim()
      : "there";
  const tpl = TEMPLATES[kind];
  const base = tpl.body(customer);

  if (body.personalize) {
    const context = typeof body.context === "string" ? body.context.trim() : "";
    const system =
      "You are a B2B sales copywriter for Fayek Abrasives (Cairo, Egypt). Rewrite " +
      "the outreach message to be warm, professional and concise. Keep the sign-off. " +
      "Return ONLY the message body.";
    const ai = await recommend(
      system,
      `Customer: ${customer}\n${context ? `Context: ${context}\n` : ""}\nMessage to rewrite:\n${base}`
    );
    if (ai) return NextResponse.json({ subject: tpl.subject, body: ai, ai: true });
  }
  return NextResponse.json({ subject: tpl.subject, body: base, ai: false });
}
