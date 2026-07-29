// Minimal OpenRouter chat helper for the Content Brain.
// Reuses the same OpenRouter key as the prompt service. The model is
// configurable via BRAIN_MODEL and defaults to the account's synthesis model
// (guaranteed to work with the existing key). Bump BRAIN_MODEL to a stronger
// model any time for sharper ideas.
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
export const BRAIN_MODEL = process.env.BRAIN_MODEL || "openai/gpt-4o-mini";

export function llmConfigured(): boolean {
  return !!OPENROUTER_KEY;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(
  messages: Msg[],
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  if (!OPENROUTER_KEY) throw new Error("OpenRouter not configured (OPENROUTER_API_KEY).");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://effortless-crm.ondigitalocean.app",
      "X-Title": "Effortless CRM Content Brain",
    },
    body: JSON.stringify({
      model: opts.model || BRAIN_MODEL,
      messages,
      temperature: opts.temperature ?? 0.8,
      max_tokens: opts.maxTokens ?? 4000,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// Pull the first JSON value out of an LLM response — tolerates ```json fences,
// leading/trailing prose, and braces that appear inside string values.
export function extractJson(text: string): any {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through to brace matching */
  }
  const start = t.search(/[{[]/);
  if (start === -1) return null;
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(t.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
