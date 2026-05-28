// API: Persist manual account ordering
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT - update the position of accounts. Body: { ids: string[] } (in desired order)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: "Expected { ids: string[] }" }, { status: 400 });
    }

    await prisma.$transaction(
      ids.map((id: string, index: number) =>
        prisma.account.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder accounts" }, { status: 500 });
  }
}
