// API: Single folder — rename / move / delete
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT - rename a folder and/or move it under a different parent
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await prisma.folder.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const data: any = {};

    if (typeof body.name === "string" && body.name.trim()) {
      data.name = body.name.trim();
    }

    if (body.parentId !== undefined) {
      const newParent: string | null = body.parentId || null;
      if (newParent === params.id) {
        return NextResponse.json({ error: "A folder can't be moved into itself" }, { status: 400 });
      }
      if (newParent) {
        // Walk up from the target parent; if we reach this folder, it's a cycle.
        let cursor = await prisma.folder.findUnique({ where: { id: newParent } });
        if (!cursor) {
          return NextResponse.json({ error: "Target folder not found" }, { status: 400 });
        }
        while (cursor) {
          if (cursor.id === params.id) {
            return NextResponse.json(
              { error: "A folder can't be moved into one of its own subfolders" },
              { status: 400 }
            );
          }
          cursor = cursor.parentId
            ? await prisma.folder.findUnique({ where: { id: cursor.parentId } })
            : null;
        }
      }
      data.parentId = newParent;
    }

    if (typeof body.position === "number") data.position = body.position;

    const folder = await prisma.folder.update({
      where: { id: params.id },
      data,
      include: { _count: { select: { inspirations: true, children: true } } },
    });

    return NextResponse.json(folder);
  } catch (error) {
    console.error("Folder update error:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

// DELETE - remove a folder. Reels inside are NOT deleted — they become unfiled
// (folderId -> null via onDelete: SetNull). Subfolders are removed (cascade), and
// their reels likewise become unfiled.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.folder.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Folder delete error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
