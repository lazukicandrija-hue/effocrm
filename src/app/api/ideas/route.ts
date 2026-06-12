// API: list ideas + create a manual idea ("My Ideas").
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ideas = await prisma.idea.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      sourceReel: {
        select: {
          shortcode: true,
          thumbnailUrl: true,
          currentViews: true,
          account: { select: { igUsername: true, username: true } },
        },
      },
    },
  });
  return NextResponse.json({ ideas });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, concept } = await req.json();
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  const idea = await prisma.idea.create({
    data: { title: title.slice(0, 200), concept: concept || null, source: "MANUAL", status: "SAVED" },
  });
  return NextResponse.json({ idea });
}
