// API: delete a First Frame → Poppy job (row + its stored source/result images).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteObject } from "@/lib/spaces";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.poppyFrame.findUnique({ where: { id: params.id } });
  if (row) {
    if (row.sourceKey) await deleteObject(row.sourceKey).catch(() => {});
    if (row.resultKey) await deleteObject(row.resultKey).catch(() => {});
    await prisma.poppyFrame.delete({ where: { id: params.id } }).catch(() => {});
  }
  return NextResponse.json({ success: true });
}
