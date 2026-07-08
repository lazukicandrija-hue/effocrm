// API: lightweight account list for pickers (e.g. the dashboard reels filter).
// Owned accounts that can have reels (igUsername set), minimal fields, no
// pagination or view-aggregation — cheap to call just to populate a dropdown.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const accounts = await prisma.account.findMany({
      where: { ownership: { not: "COMPETITOR" }, igUsername: { not: null } },
      select: { id: true, username: true, igUsername: true, modelId: true, niche: true },
      orderBy: { username: "asc" },
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Account options error:", error);
    return NextResponse.json(
      { error: "Failed to list accounts" },
      { status: 500 }
    );
  }
}
