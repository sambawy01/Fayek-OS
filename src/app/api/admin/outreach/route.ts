import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session-server";
import { recommend } from "@/lib/ai-recommend";
import { brandedEmailHtml, escapeHtml } from "@/lib/branded-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "intro" | "followup" | "quote_cover" | "reminder";

const CONTACTS = "info@ftc-eg.com · +20 2 2415 6092";

/**
 * Plain-text sign-off. Includes the sender's signature (name / title, may be
 * multi-line) when provided, then the company name and contacts.
 */
function signOff(signature: string): string {
  const who = signature.trim();
  return `\n\nWarm regards,\n${who ? `${who}\n` : ""}Fayek Abrasives\n${CONTACTS}`;
}

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
 * Wrap the message body (WITHOUT the sign-off) in the branded HTML email shell
 * (real logo band + brand palette). The sign-off — sender signature, company,
 * contacts — is rendered as the branded footer beneath the card.
 */
function toBrandedHtml(subject: string, bodyNoSign: string, signature: string): string {
  const contentHtml = bodyNoSign
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;color:#3A332C;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`
    )
    .join("\n      ");

  const sig = signature.trim();
  const sigLine = sig
    ? `<strong style="color:#3A332C;">${escapeHtml(sig).replace(/\n/g, "<br />")}</strong><br />`
    : "";
  const belowCardHtml =
    `Warm regards,<br />${sigLine}` +
    `<strong style="color:#3A332C;">Fayek Abrasives</strong><br />` +
    `<a href="mailto:info@ftc-eg.com" style="color:#357F75;text-decoration:none;">info@ftc-eg.com</a> &middot; ` +
    `+20 2 2415 6092 &middot; ` +
    `<a href="https://www.fayekabrasives.com" style="color:#357F75;text-decoration:none;">fayekabrasives.com</a>`;

  return brandedEmailHtml({ heading: subject, contentHtml, belowCardHtml });
}

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
  const tpl = TEMPLATES[kind];
  let bodyNoSign = tpl.body(customer);
  let ai = false;

  if (body.personalize) {
    const context = typeof body.context === "string" ? body.context.trim() : "";
    const system =
      "You are a B2B sales copywriter for Fayek Abrasives (Cairo, Egypt). Rewrite " +
      "the outreach message to be warm, professional and concise. Do NOT add a " +
      "sign-off, signature, or contact details — those are appended separately. " +
      "Return ONLY the message body.";
    const rewritten = await recommend(
      system,
      `Customer: ${customer}\n${context ? `Context: ${context}\n` : ""}\nMessage to rewrite:\n${bodyNoSign}`
    );
    if (rewritten) {
      // Strip any sign-off the model added despite instructions.
      bodyNoSign = rewritten.replace(/\n+Warm regards,[\s\S]*$/i, "").trim();
      ai = true;
    }
  }

  const plainBody = bodyNoSign + signOff(signature);
  const html = toBrandedHtml(tpl.subject, bodyNoSign, signature);
  return NextResponse.json({ subject: tpl.subject, body: plainBody, html, ai });
}
