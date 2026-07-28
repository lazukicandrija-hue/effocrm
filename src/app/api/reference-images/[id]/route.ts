// API: delete a reference image (record + the Spaces object).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteObject } from "@/lib/spaces";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.referenceImage.findUnique({ where: { id: params.id } });
  if (row) {
    await deleteObject(row.imageKey).catch(() => {}); // best-effort — record delete matters most
    await prisma.referenceImage.delete({ where: { id: params.id } }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}
