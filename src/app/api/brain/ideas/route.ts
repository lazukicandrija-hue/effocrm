// API: Content Brain — generate reel ideas + ready-to-paste Seedance prompts,
// grounded in the agency's top-performing reels and reference-image library.
// On-demand only: nothing is persisted; the page keeps the cards it likes.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { chat, extractJson, llmConfigured, BRAIN_MODEL } from "@/lib/llm";

export const dynamic = "force-dynamic";

// Poppy's current content lane — relatable service-industry "it girl" settings.
// This is just the seed; the live list also folds in whatever reference-image
// folders exist, so it always matches what's actually being made.
const SEED_NICHES = ["McDonald's", "Starbucks", "Chipotle", "Waitress", "Delivery Girl", "Cashier"];

async function availableNiches(): Promise<string[]> {
  const set = new Set<string>(SEED_NICHES);
  try {
    const refs = await prisma.referenceImage.groupBy({ by: ["niche"], _count: { _all: true } });
    for (const r of refs) if (r.niche?.trim()) set.add(r.niche.trim());
  } catch {
    /* reference table optional */
  }
  return Array.from(set);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const SYSTEM = `You are the Content Brain for Effortless — an agency that runs Instagram accounts for an AI model named "Poppy" (a blonde woman). Content is faceless/AI-generated short-form reels made image-to-video with Seedance 2.0 / Kling: every reel starts from a reference image of Poppy and is animated with a MOTION prompt.

WHO POPPY IS ON CAMERA:
- A cute, flirty girl-next-door who works relatable everyday service jobs — the fast-food cashier, the Starbucks/matcha barista, the Chipotle line, the waitress, the delivery girl. Think "the pretty girl working the counter who clearly likes you."
- The winning formula is POV / relatable: the viewer is the customer she is quietly flirting with. Uniform or workplace setting, a little spicy, very approachable.

CONTENT LANE — read carefully:
- Flirty, suggestive, teasing — NOT explicit. Clothed, playful, "she's into you."
- NEVER describe nudity, explicit acts, or a reveal of private body parts. If a concept leans on a reveal, soften it to clothed teasing (a glance, a lip bite, a slow lean over the counter, an over-the-shoulder look).
- Goal: a scroll-stopping tease that makes people follow — not porn.

HOOKS should read like POV / relatable on-screen captions, e.g. "POV: your cashier can't stop staring at you", "when the Starbucks girl writes her number on your cup", "she gave you extra fries for a reason". Punchy, under 90 chars.

SEEDANCE / KLING PROMPT RULES (this is exactly how the "seedancePrompt" field must be written):
- MOTION ONLY. Describe the camera move + her body motion + the action + the setting/vibe. One continuous shot.
- NEVER describe her appearance. She is ALWAYS Poppy and always blonde — do NOT state hair color, face, skin, body, or outfit/uniform colors. The reference image already fixes how she looks.
- Put her in the JOB: behind the counter, at the drive-thru window, making a drink, carrying a tray, leaning to the car window.
- Be concrete and filmable: a real camera move (POV push-in, handheld, locked-off, slow pan), a specific physical motion, and a lighting/mood cue.
- Keep it teasing, never explicit.

GOOD seedancePrompt examples (match this style and length):
- "POV push-in toward the counter as she slides a drink forward, leaning on her elbows with a playful smirk, biting her lip as she glances up at the camera, then tucking a strand of hair behind her ear. Bright fast-food lighting, handheld feel, shallow depth of field."
- "Locked-off medium shot at the drive-thru window, she holds a bag out toward the lens, pulls it back for a teasing beat with a grin, then leans out the window closer to camera. Warm evening light, soft-focus background."
- "Static POV across a café counter, she finishes a matcha and slides it over, taps the lid, glances down then back up with a slow smile as she leans in. Cozy indoor light, subtle push-in."

Return STRICT JSON only, no prose, in this exact shape:
{"ideas":[{"hook":"the on-screen text / first line that stops the scroll (punchy, under 90 chars)","concept":"1-2 sentences: what the reel is and why it works","niche":"which job/setting","seedancePrompt":"a motion-only prompt following the rules above","referenceImage":"which reference-image folder to start from","why":"one line tying it to what's performing"}]}`;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ niches: await availableNiches() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!llmConfigured()) {
    return NextResponse.json(
      { error: "AI isn't connected yet (OPENROUTER_API_KEY missing on the CRM)." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const count = Math.min(Math.max(Number(body.count) || 6, 1), 12);
  const focusNiche: string | null =
    body.niche && String(body.niche).trim() ? String(body.niche).trim().slice(0, 60) : null;
  const refine: string = (body.refine || "").toString().slice(0, 500);

  // --- Context 1: top-performing reels (what's actually landing) ---
  const reels = await prisma.reel.findMany({
    where: { account: { igUsername: { not: null } } },
    orderBy: { currentViews: "desc" },
    take: 80,
    select: {
      caption: true,
      currentViews: true,
      account: { select: { id: true, igUsername: true, username: true, niche: true } },
      analysis: { select: { summary: true } },
    },
  });

  // per-account baseline so a big number is judged against that account's norm
  const byAcc: Record<string, number[]> = {};
  for (const r of reels) (byAcc[r.account.id] ||= []).push(r.currentViews);
  const base: Record<string, number> = {};
  for (const [a, v] of Object.entries(byAcc)) base[a] = median(v) || 1;

  // which niches pull the most (avg views across the top set)
  const nichePerf: Record<string, { total: number; n: number }> = {};
  for (const r of reels) {
    const ns = r.account.niche.length ? r.account.niche : ["(uncategorized)"];
    for (const nn of ns) {
      (nichePerf[nn] ||= { total: 0, n: 0 });
      nichePerf[nn].total += r.currentViews;
      nichePerf[nn].n += 1;
    }
  }
  const nicheLines = Object.entries(nichePerf)
    .map(([n, v]) => ({ n, avg: Math.round(v.total / v.n) }))
    .sort((a, b) => b.avg - a.avg)
    .map((x) => `- ${x.n}: ~${x.avg.toLocaleString()} avg views`);

  let topReels = reels;
  if (focusNiche) {
    const fl = focusNiche.toLowerCase();
    const matched = reels.filter((r) => r.account.niche.some((n) => n.toLowerCase().includes(fl)));
    if (matched.length) topReels = matched; // else keep the global top set as a fallback
  }
  const reelLines = topReels.slice(0, 20).map((r) => {
    const niche = r.account.niche.length ? r.account.niche.join(", ") : "n/a";
    const over = Math.round((r.currentViews / (base[r.account.id] || 1)) * 10) / 10;
    const detail = r.analysis?.summary
      ? "what happens: " + r.analysis.summary.replace(/\n/g, " ").slice(0, 220)
      : "caption: " + (r.caption || "").replace(/\n/g, " ").slice(0, 120);
    return `- @${r.account.igUsername || r.account.username} | ${r.currentViews.toLocaleString()} views (${over}x their baseline) | niche: ${niche} | ${detail}`;
  });

  // --- Context 2: reference-image inventory (what they can actually start from) ---
  const refs = await prisma.referenceImage
    .groupBy({ by: ["niche"], _count: { _all: true } })
    .catch(() => [] as Array<{ niche: string; _count: { _all: number } }>);
  const refLines = refs.map((r) => `- ${r.niche}: ${r._count._all} image(s)`).sort();
  const niches = Array.from(
    new Set([...SEED_NICHES, ...refs.map((r) => r.niche?.trim()).filter(Boolean) as string[]])
  );

  // --- Assemble the user message ---
  const parts: string[] = [];
  parts.push(`NICHES / SETTINGS AVAILABLE: ${niches.join(", ")}`);
  if (nicheLines.length)
    parts.push(`NICHE PERFORMANCE (higher avg = make more of it):\n${nicheLines.join("\n")}`);
  if (reelLines.length) parts.push(`TOP-PERFORMING REELS RIGHT NOW:\n${reelLines.join("\n")}`);
  else parts.push(`(No scraped reel data yet — lean on the settings above and general short-form best practices.)`);
  if (refLines.length)
    parts.push(
      `REFERENCE IMAGES ON HAND (prefer starting ideas from folders that already have images):\n${refLines.join("\n")}`
    );
  if (focusNiche) parts.push(`FOCUS: only generate ideas for the "${focusNiche}" setting.`);
  if (refine) parts.push(`EXTRA DIRECTION FROM THE USER: ${refine}`);
  parts.push(
    `Generate ${count} fresh reel ideas as JSON. Skew toward what's performing. Each seedancePrompt must be motion-only (no appearance) and teasing, not explicit.`
  );

  let ideas: any[] = [];
  try {
    const text = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: parts.join("\n\n") },
      ],
      { temperature: 0.85, maxTokens: 4000 }
    );
    const data = extractJson(text);
    ideas = Array.isArray(data) ? data : data?.ideas || [];
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Idea generation failed." }, { status: 502 });
  }

  const clean = ideas
    .filter((i) => i && (i.hook || i.concept || i.seedancePrompt))
    .slice(0, count)
    .map((i) => ({
      hook: String(i.hook || "").slice(0, 200),
      concept: String(i.concept || "").slice(0, 600),
      niche: String(i.niche || focusNiche || "").slice(0, 60),
      seedancePrompt: String(i.seedancePrompt || "").slice(0, 1200),
      referenceImage: String(i.referenceImage || i.niche || "").slice(0, 120),
      why: String(i.why || "").slice(0, 300),
    }));

  return NextResponse.json({ ideas: clean, model: BRAIN_MODEL, grounded: reelLines.length > 0 });
}
