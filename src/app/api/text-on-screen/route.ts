// API: Text-On-Screen — read a reel and return 3-5 flirty text-on-screen HOOK ideas
// (a VA adds them manually). Input is either { frames } (extracted in the browser for
// uploads) or { url } (a link → we grab the opening frame). No video is produced.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { chat, extractJson, describeFrames, llmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";

const SYSTEM = `You write "text-on-screen" HOOKS for an AI model named Poppy — a flirty, relatable service-industry girl (cashier, barista, waitress, delivery, etc.) on Instagram reels. The hook is ONE short sentence overlaid on the video to stop the scroll.

RULES:
- English only (these target a US audience).
- Flirty / playful / teasing — suggestive with a wink, but NOT explicit (no explicit words; Instagram auto-flags those).
- Short: a single punchy sentence, ideally under ~10 words.
- POV / relatable framing where it fits ("POV: your cashier…", "when the barista…", "she gave you extra fries for a reason").
- Ground each hook in what actually happens in the reel (you'll get a description).
- Use tasteful emojis (👀🔥😉😏🤭) where they add punch.

Return STRICT JSON only: {"hooks":["hook 1","hook 2","hook 3","hook 4","hook 5"]}`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!llmConfigured()) {
    return NextResponse.json({ error: "AI isn't connected (OPENROUTER_API_KEY missing)." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({} as any));
  let frames: string[] = Array.isArray(body.frames) ? body.frames.filter((f: any) => typeof f === "string") : [];
  const url = (body.url || "").toString().trim();

  // Link → grab the opening frame via the prompt service (already works with API_SECRET).
  if (!frames.length && url) {
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Paste a valid reel URL (https://…)." }, { status: 400 });
    }
    if (!API_URL) return NextResponse.json({ error: "Prompt service not connected." }, { status: 503 });
    try {
      const r = await fetch(`${API_URL}/first-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}) },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(60000),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || !j.first_frame) {
        return NextResponse.json({ error: j.detail || j.error || "Couldn't read that reel link." }, { status: 502 });
      }
      frames = [`data:${j.content_type || "image/jpeg"};base64,${j.first_frame}`];
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Reel download failed." }, { status: 502 });
    }
  }

  if (!frames.length) {
    return NextResponse.json({ error: "No reel frames — upload a video or paste a link." }, { status: 400 });
  }

  // 1) Vision: what happens in the reel.
  const context = await describeFrames(frames);

  // 2) Write the hooks from that context.
  let hooks: string[] = [];
  try {
    const text = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            (context ? `REEL: ${context}` : "REEL: (a Poppy service-industry reel — flirty, relatable)") +
            `\n\nWrite 5 text-on-screen hook ideas as JSON.`,
        },
      ],
      { temperature: 0.9, maxTokens: 600 }
    );
    const data = extractJson(text);
    hooks = (Array.isArray(data) ? data : data?.hooks || [])
      .filter((h: any) => typeof h === "string" && h.trim())
      .map((h: string) => h.trim().slice(0, 140))
      .slice(0, 5);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't generate hooks." }, { status: 502 });
  }

  if (!hooks.length) {
    return NextResponse.json({ error: "No hooks came back — try again." }, { status: 502 });
  }
  return NextResponse.json({ hooks, context, thumb: frames[0] });
}
