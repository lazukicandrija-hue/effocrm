// API: Bad outputs — list + create. Video bytes live in Spaces; we store the key
// and expose each item's playback URL as /api/bad-outputs/:id/video.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sp = req.nextUrl.searchParams;
    const search = (sp.get("search") || "").trim();
    const niche = sp.get("niche") || "all";
    const ai = sp.get("ai") || "all";

    const where: any = {};
    if (search) {
      where.OR = [
        { issue: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { aiUsed: { contains: search, mode: "insensitive" } },
      ];
    }
    if (niche !== "all") where.niche = { has: niche };
    if (ai !== "all") where.aiUsed = ai;

    const items = await prisma.badOutput.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Distinct niches + AIs across all rows, for the filter chips.
    const all = await prisma.badOutput.findMany({ select: { niche: true, aiUsed: true } });
    const allNiches = Array.from(new Set(all.flatMap((i) => i.niche))).sort((a, b) => a.localeCompare(b));
    const allAis = Array.from(
      new Set(all.map((i) => i.aiUsed).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      items: items.map((i) => ({ ...i, videoUrl: `/api/bad-outputs/${i.id}/video` })),
      allNiches,
      allAis,
    });
  } catch (error) {
    console.error("Bad outputs fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch bad outputs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.videoKey) {
      return NextResponse.json({ error: "A video is required" }, { status: 400 });
    }
    const niche: string[] = Array.isArray(body.niche)
      ? body.niche.filter((n: any) => typeof n === "string" && n.trim()).map((n: string) => n.trim())
      : [];
    const item = await prisma.badOutput.create({
      data: {
        videoKey: body.videoKey,
        aiUsed: body.aiUsed?.trim() || null,
        niche,
        issue: body.issue?.trim() || null,
        reason: body.reason?.trim() || null,
        notes: body.notes?.trim() || null,
        addedBy: body.addedBy?.trim() || null,
      },
    });
    return NextResponse.json(
      { ...item, videoUrl: `/api/bad-outputs/${item.id}/video` },
      { status: 201 }
    );
  } catch (error) {
    console.error("Bad output create error:", error);
    return NextResponse.json(
      { error: "Failed to save", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
