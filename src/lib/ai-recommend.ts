/**
 * Executive AI recommendations via Ollama Cloud (or a local Ollama in dev).
 * Fails soft: returns "" when the model isn't configured or the call fails, so
 * the Approvals UI can fall back to "AI unavailable" without breaking.
 */
export async function recommend(
  systemContext: string,
  question: string
): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY;
  const base = apiKey ? "https://ollama.com" : "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: systemContext },
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { message?: { content?: string } };
    return (data.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

/** Recommendation for a factory-batch receiving discrepancy. */
export async function recommendForDiscrepancy(detail: {
  reference: string;
  supplier: string;
  lines: { name: string; expectedQty: number; receivedQty: number; diff: number }[];
}): Promise<string> {
  const system =
    "You are the operations advisor for Fayek Abrasives, an industrial abrasives " +
    "and filtration supplier in Cairo, Egypt. You advise the Owner on warehouse " +
    "receiving decisions. Be concise and decisive.";
  const q =
    `A factory batch was received with quantity discrepancies.\n` +
    `Supplier: ${detail.supplier || "(unspecified)"} · Reference: ${detail.reference || "(none)"}\n` +
    detail.lines
      .map(
        (l) =>
          `- ${l.name}: expected ${l.expectedQty}, received ${l.receivedQty} (${
            l.diff > 0 ? "+" : ""
          }${l.diff})`
      )
      .join("\n") +
    `\n\nIn 2–4 short sentences, give the Owner an executive recommendation: ` +
    `accept the received quantities into stock, reject the batch, or investigate — ` +
    `and briefly why (likely cause + stock/financial impact).`;
  return recommend(system, q);
}
