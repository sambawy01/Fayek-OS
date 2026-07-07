/**
 * AI-assisted production planning. Feeds the model a snapshot of inventory
 * (on-hand − reserved = available, effective reorder point), per-item sales
 * velocity with 7/30/90-day trend, lead times, and the cash position (revenue +
 * open receivables), and asks it to recommend what to produce now and how much.
 * Suggestions only — Owner/Admin still creates the orders. Fails soft (empty +
 * reason) when the model isn't configured.
 */
import { recommend } from "./ai-recommend";
import { getCatalog } from "./catalog";
import { availability } from "./reservations";
import { purchaseOrderSalesSummary } from "./sales";
import { productVelocity, computedReorderPoint } from "./forecast";
import { listReceivables } from "./receivables";
import { db } from "./db";

export interface ProductionSuggestion {
  slug: string;
  name: string;
  suggestedQty: number;
  rationale: string;
}

async function openProductionSlugs(): Promise<Set<string>> {
  const rows = (await db()`
    SELECT slug FROM production_orders WHERE status IN ('pending_approval','approved','in_production')
  `) as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
}

export async function aiSuggestProduction(): Promise<{ suggestions: ProductionSuggestion[]; reason?: string }> {
  if (!process.env.OLLAMA_API_KEY) return { suggestions: [], reason: "AI isn't configured (OLLAMA_API_KEY not set)." };

  const [products, sales, receivables, openSlugs, velocity] = await Promise.all([
    getCatalog(), purchaseOrderSalesSummary(30), listReceivables(true), openProductionSlugs(), productVelocity(),
  ]);

  // Candidates: tracked, produced (not frequent-supply), active, no open order.
  const tracked = products.filter((p) => p.quantity !== null && !p.frequentSupply && p.active && !openSlugs.has(p.slug));
  const avail = await availability(tracked.map((p) => p.slug));

  const rows = tracked
    .map((p) => {
      const a = avail.get(p.slug);
      const reserved = a?.reserved ?? 0;
      const available = Math.max(0, (p.quantity ?? 0) - reserved);
      const v = velocity.get(p.slug);
      // Effective reorder point = manual floor vs velocity-driven point (demand
      // over lead+safety, or the 30/10 movement-tier floor), computed fresh here
      // so suggestions reflect the very latest sales.
      const effectivePoint = Math.max(p.reorderPoint, computedReorderPoint(v, p.leadTimeDays));
      return {
        slug: p.slug, name: p.en.name, onHand: p.quantity ?? 0, reserved, available,
        effectivePoint, leadTimeDays: p.leadTimeDays,
        d7: v?.d7 ?? 0, d30: v?.d30 ?? 0, d90: v?.d90 ?? 0,
      };
    })
    .filter((r) => r.available <= r.effectivePoint * 2 || r.d30 > 0) // needs attention
    .sort((a, b) => (a.available - a.effectivePoint) - (b.available - b.effectivePoint))
    .slice(0, 30);

  if (rows.length === 0) return { suggestions: [], reason: "Nothing needs production right now (stock is healthy)." };

  const outstanding = receivables.reduce((s, r) => s + r.balanceEgp, 0);
  const system =
    "You are the production planner for Fayek Abrasives (industrial abrasives & filtration, Cairo). " +
    "Recommend factory production quantities that avoid stockouts without overproducing, mindful of cash and lead times. " +
    "Watch the 7/30/90-day trend: rising demand (7-day rate above the 30-day rate) warrants a larger run; fading demand a smaller one. Be decisive.";
  const q = [
    `30-day revenue: ${sales.revenueEgp} EGP across ${sales.orderCount} orders.`,
    `Cash tied up in open receivables: ${outstanding} EGP.`,
    `Candidate products (available = on-hand − reserved; sold7/30/90 = units sold in the last 7/30/90 days; lead = days to replenish; reorder point already accounts for lead time + safety):`,
    ...rows.map((r) => `- ${r.name} [${r.slug}]: available ${r.available}, on-hand ${r.onHand}, reserved ${r.reserved}, reorder point ${r.effectivePoint}, lead ${r.leadTimeDays}d, sold7 ${r.d7}, sold30 ${r.d30}, sold90 ${r.d90}`),
    ``,
    `Return ONLY a JSON array (no prose) of items worth producing now, each exactly: ` +
      `{"slug","name","suggestedQty","rationale"}. suggestedQty = a sensible run that covers demand across the lead time plus ~30–60 days, adjusted for the trend, refilling above the reorder point. ` +
      `At most 12 items; prioritise the most at-risk / fastest-selling; keep totals reasonable given the cash position; omit items that don't need production.`,
  ].join("\n");

  const raw = await recommend(system, q);
  if (!raw) return { suggestions: [], reason: "The model was unavailable — try again shortly." };
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return { suggestions: [], reason: "Couldn't parse the AI response." };
  try {
    const parsed = JSON.parse(m[0]) as { slug?: unknown; suggestedQty?: unknown; rationale?: unknown }[];
    const nameBySlug = new Map(rows.map((r) => [r.slug, r.name]));
    const suggestions = parsed
      .filter((x) => x && typeof x.slug === "string" && nameBySlug.has(x.slug) && Number(x.suggestedQty) > 0)
      .map((x) => ({
        slug: x.slug as string,
        name: nameBySlug.get(x.slug as string)!,
        suggestedQty: Math.round(Number(x.suggestedQty)),
        rationale: String(x.rationale ?? "").slice(0, 300),
      }))
      .slice(0, 12);
    return { suggestions };
  } catch {
    return { suggestions: [], reason: "The AI response wasn't valid JSON." };
  }
}
