// Delete a single Auto-Recreate job (used by the X on a card). Session only.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.recreation.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ success: true });
}
