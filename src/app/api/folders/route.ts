// API: Marketing folders — list all + create
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - return every folder (the client builds the tree + breadcrumbs from these),
// each with how many reels and subfolders it directly contains.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const folders = await prisma.folder.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { inspirations: true, children: true } } },
    });
    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Folders fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

// POST - create a folder (optionally nested under parentId)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }

    const parentId: string | null = body.parentId || null;
    if (parentId) {
      const parent = await prisma.folder.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 400 });
      }
    }

    // Place it after existing siblings.
    const siblingCount = await prisma.folder.count({ where: { parentId } });

    const folder = await prisma.folder.create({
      data: { name, parentId, position: siblingCount },
      include: { _count: { select: { inspirations: true, children: true } } },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error("Folder create error:", error);
    return NextResponse.json(
      { error: "Failed to create folder", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
