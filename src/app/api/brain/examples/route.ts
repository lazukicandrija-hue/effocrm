// API: Content Brain examples ("Prompt Library"). Create a curated example (prompt +
// reference image + finished reel) and list them. On create it auto-describes the
// image with the vision model and auto-pulls the reel's views from the scraper.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { presignGet } from "@/lib/spaces";
import { describeImage } from "@/lib/llm";

export const dynamic = "force-dynamic";

function shortcodeOf(url: string): string | null {
  const m = String(url).match(/\/reels?\/([^/?#]+)/i) || String(url).match(/\/p\/([^/?#]+)/i);
  return m ? m[1] : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.brainExample.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      prompt: r.prompt,
      niche: r.niche,
      imageDesc: r.imageDesc,
      reelUrl: r.reelUrl,
      views: r.views,
      note: r.note,
      createdAt: r.createdAt,
      url: r.imageKey ? await presignGet(r.imageKey, 6 * 24 * 3600).catch(() => null) : null,
    }))
  );
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({} as any));
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "Paste the prompt you used." }, { status: 400 });

  const niche = body.niche ? String(body.niche).trim().slice(0, 60) : null;
  const imageKey = body.imageKey ? String(body.imageKey).trim() : null;
  const reelUrl = body.reelUrl ? String(body.reelUrl).trim() : null;
  const note = body.note ? String(body.note).trim().slice(0, 500) : null;

  // Auto-describe the reference image so the text brain can actually use it.
  let imageDesc: string | null = null;
  if (imageKey) {
    try {
      const url = await presignGet(imageKey, 3600);
      const desc = await describeImage(url);
      imageDesc = desc || null;
    } catch {
      /* best-effort */
    }
  }

  // Auto-pull views if the finished reel is one of our tracked accounts.
  let reelShortcode: string | null = null;
  let views: number | null = null;
  if (reelUrl) {
    reelShortcode = shortcodeOf(reelUrl);
    if (reelShortcode) {
      const reel = await prisma.reel
        .findFirst({ where: { shortcode: reelShortcode }, select: { currentViews: true } })
        .catch(() => null);
      if (reel) views = reel.currentViews;
    }
  }

  const created = await prisma.brainExample.create({
    data: {
      prompt: prompt.slice(0, 2000),
      niche,
      imageKey,
      imageDesc,
      reelUrl,
      reelShortcode,
      views,
      note,
      addedBy: (session.user?.name || session.user?.email || "").toString().slice(0, 60) || null,
    },
  });
  return NextResponse.json({ id: created.id, imageDesc, views }, { status: 201 });
}
