/**
 * AI sales copywriting grounded in real research + our catalogue.
 *
 * `draftOutreach` takes research about a prospective customer (their website
 * text, search snippets, a human brief) plus a summary of our products and asks
 * the model to write a genuinely tailored consultative email — referencing the
 * customer's actual scope, specific relevant products, and concrete improvements
 * (quality, supply-chain/lead-time, cost). Returns structured fields so the UI
 * can show the rationale and relevant products, not just the message.
 *
 * Requires OLLAMA_API_KEY (see ai-recommend). When the model is unavailable the
 * caller gets `ai:false` and a safe template fallback.
 */
import { recommend } from "./ai-recommend";
import type { Product } from "./catalog";

export interface OutreachDraft {
  subject: string;
  body: string;
  relevantProducts: string[];
  rationale: string;
  ai: boolean;
}

/** Compact, token-lean catalogue summary for grounding the model. */
export function catalogSummaryForAI(products: Product[], limit = 60): string {
  return products
    .filter((p) => p.active)
    .slice(0, limit)
    .map((p) => {
      const desc = (p.en.desc || "").replace(/\s+/g, " ").slice(0, 90);
      return `- ${p.en.name}${desc ? ` — ${desc}` : ""}`;
    })
    .join("\n");
}

const SYSTEM =
  "You are a senior B2B sales consultant for Fayek Abrasives, an industrial " +
  "abrasives and filtration supplier in Cairo, Egypt (since 1997). Given research " +
  "about a prospective customer and OUR product catalogue, write a concise, " +
  "personalized outreach email. It MUST: (1) show you understand the customer's " +
  "actual business and scope; (2) reference SPECIFIC products of ours that fit " +
  "their operations; (3) propose concrete, credible improvements to their " +
  "products/process, supply chain (reliability, lead times, local stock) and " +
  "cost. Be professional and warm, never generic or pushy. Do NOT invent facts " +
  "about the customer beyond the research. Do NOT add a sign-off, signature or " +
  "contact details (they are appended separately). Respond with STRICT JSON only, " +
  'no markdown fences: {"subject": string, "body": string, ' +
  '"relevantProducts": string[], "rationale": string}. "rationale" is a one-line ' +
  "note (for our sales team) on why this customer is a fit.";

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function draftOutreach(input: {
  companyName: string;
  research: string;
  brief?: string;
  catalogSummary: string;
  fallbackSubject: string;
  fallbackBody: string;
}): Promise<OutreachDraft> {
  const research = input.research.replace(/\s+/g, " ").slice(0, 6000);
  const q =
    `Prospective customer: ${input.companyName}\n\n` +
    (input.brief ? `Sales brief / goal: ${input.brief}\n\n` : "") +
    `Research (their website & web results):\n${research || "(no research available)"}\n\n` +
    `OUR CATALOGUE (reference these):\n${input.catalogSummary}\n\n` +
    `Write the tailored outreach email now as strict JSON.`;

  const raw = await recommend(SYSTEM, q);
  if (raw) {
    const parsed = extractJson(raw);
    if (parsed && typeof parsed.body === "string" && parsed.body.trim()) {
      return {
        subject:
          typeof parsed.subject === "string" && parsed.subject.trim()
            ? parsed.subject.trim()
            : input.fallbackSubject,
        body: (parsed.body as string).trim(),
        relevantProducts: Array.isArray(parsed.relevantProducts)
          ? (parsed.relevantProducts as unknown[]).map(String).filter(Boolean).slice(0, 8)
          : [],
        rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : "",
        ai: true,
      };
    }
    // Model replied but not as JSON — use its prose as the body.
    return {
      subject: input.fallbackSubject,
      body: raw.replace(/\n+Warm regards,[\s\S]*$/i, "").trim(),
      relevantProducts: [],
      rationale: "",
      ai: true,
    };
  }

  // Model unavailable → safe template fallback.
  return {
    subject: input.fallbackSubject,
    body: input.fallbackBody,
    relevantProducts: [],
    rationale: "",
    ai: false,
  };
}
