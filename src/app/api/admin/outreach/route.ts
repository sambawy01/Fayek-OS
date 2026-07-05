import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { getCatalog } from "@/lib/catalog";
import { catalogSummaryForAI, draftOutreach } from "@/lib/ai-sales";
import { webExtract, webSearch, webSearchConfigured, hostOf } from "@/lib/websearch";
import { signOff, brandedOutreachHtml } from "@/lib/outreach-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ensure a pasted domain becomes a fetchable URL. */
function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
}

type Kind = "intro" | "followup" | "quote_cover" | "reminder";

// Body templates END before the sign-off; signOff() is appended so the sender's
// signature is respected consistently across templates and AI rewrites.
const TEMPLATES: Record<Kind, { subject: string; body: (c: string) => string }> = {
  intro: {
    subject: "Introduction — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nI'm reaching out from Fayek Abrasives, an industrial abrasives and filtration supplier in Cairo (since 1997). We'd be glad to support your operations with quality, cost-oriented products tailored to your specifications.\n\nMay I send our catalogue or prepare a quotation for your requirements?`,
  },
  followup: {
    subject: "Following up — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nJust following up on my previous message. I'd be happy to answer any questions or put together a quotation whenever it's convenient.\n\nLooking forward to hearing from you.`,
  },
  quote_cover: {
    subject: "Your quotation — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nPlease find attached our quotation for your requirements. Prices are in EGP and subject to stock availability. Do let me know if you'd like any adjustments to quantities or specifications.\n\nWe look forward to serving you.`,
  },
  reminder: {
    subject: "Payment reminder — Fayek Abrasives",
    body: (c) =>
      `Dear ${c},\n\nA gentle reminder regarding the outstanding balance on your account. Please let me know if you need the invoice details or wish to arrange payment.\n\nThank you for your business.`,
  },
};


/**
 * POST { kind, customerName, context?, signature?, personalize? }
 *   → { subject, body, html, ai }.
 * `body` is the plain-text email; `html` is the branded version (logo + colors).
 */
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
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const website = typeof body.website === "string" ? normalizeUrl(body.website) : "";
  const brief = typeof body.context === "string" ? body.context.trim() : "";
  const tpl = TEMPLATES[kind];
  let subject = tpl.subject;
  let bodyNoSign = tpl.body(customer);
  let ai = false;
  let relevantProducts: string[] = [];
  let researched = false;

  if (body.personalize) {
    // 1) Research the customer: extract their website + a light web search.
    let research = "";
    if (website) {
      const pages = await webExtract([website]);
      research += Object.values(pages).join("\n\n");
    }
    const hits = await webSearch(
      `${customer} ${website ? hostOf(website) : "Egypt industrial company"}`.trim(),
      { maxResults: 4 }
    );
    if (hits.length) {
      research += "\n\n" + hits.map((h) => `${h.title}: ${h.content}`).join("\n");
    }
    researched = website !== "" || hits.length > 0;

    // 2) Draft a consultative, product-specific email grounded in the research.
    const products = await getCatalog();
    const draft = await draftOutreach({
      companyName: customer === "there" ? "the customer" : customer,
      research,
      brief,
      catalogSummary: catalogSummaryForAI(products),
      fallbackSubject: tpl.subject,
      fallbackBody: bodyNoSign,
    });
    subject = draft.subject;
    bodyNoSign = draft.body;
    ai = draft.ai;
    relevantProducts = draft.relevantProducts;
  }

  const plainBody = bodyNoSign + signOff(signature);
  const html = brandedOutreachHtml(subject, bodyNoSign, signature);
  return NextResponse.json({
    subject,
    body: plainBody,
    html,
    ai,
    relevantProducts,
    researched,
    // Tell the UI when a requested personalization couldn't actually use AI /
    // web search, so it can prompt the owner to set the keys.
    aiUnavailable: !!body.personalize && !ai,
    webSearchAvailable: webSearchConfigured(),
  });
}
