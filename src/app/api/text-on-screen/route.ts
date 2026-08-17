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

const SYSTEM = `You write "text-on-screen" HOOKS for flirty AI-model Instagram reels — relatable blue-collar / service-industry girls (mechanic, cashier, barista, waitress, delivery, etc.). The hook is overlaid text that stops the scroll AND drives engagement (follows, comments, likes, DMs).

STYLE — match this closely; this is what actually works for this niche:
- Relatable & a little self-deprecating: play the underdog / "just a normal girl" / "nobody notices me" / the misunderstood [niche] girl. It makes men feel protective and reply.
- Engagement-driving CTAs: bait a comment ("be brutally honest in the comments"), a like ("a ❤️ would make my day"), a follow ("it's okay if you don't follow me, but…"), or a DM.
- Niche pride / identity: own the job ("backbone of our economy", "sweat and dirt", "[niche] girls get made fun of these days").
- Playfully flirty and teasing — suggestive with a wink, but NOT explicit (no explicit sexual wording or body-part innuendo — Instagram auto-flags it and it kills reach).
- First person, talking straight to the viewer / "men".
- Wordplay / puns when they land.
- English only (US audience). Emojis welcome (🔧🚗❤️🥺😉😏🤭🇺🇸).

LENGTH: 1–4 short lines, like a mini-caption — NOT one tiny sentence. Punchy. Use line breaks (\\n) where a real caption would.

Ground them loosely in the reel (setting / what she's doing / her job), but the persona + engagement angle matter more than literally describing the reel.

EXAMPLES OF THE VIBE (match the energy, don't copy verbatim):
- "It's okay if you don't follow me…\\nmechanic girls already get made fun of enough.\\nBut a ❤️ from you would make my day."
- "Iran this, Iran that…\\nI ran out of clean clothes after being the backbone of the economy all day 🔧🇺🇸"
- "Men, be brutally honest…\\nwould you ever date a mechanic girl? Sweat and dirt included 🔧🚗\\nComment below ❤️"
- "I'm just a normal girl, not a model.\\nI know nobody wants me… but could you at least say hi? 🥺"
- "Hiring a boyfriend 📋\\n- must be taller than me (I'm 5'1)\\n- must actually text back\\n- bonus points if you like cars 😉"

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
      .map((h: string) => h.trim().replace(/\\n/g, "\n").slice(0, 300))
      .slice(0, 5);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't generate hooks." }, { status: 502 });
  }

  if (!hooks.length) {
    return NextResponse.json({ error: "No hooks came back — try again." }, { status: 502 });
  }
  return NextResponse.json({ hooks, context, thumb: frames[0] });
}
