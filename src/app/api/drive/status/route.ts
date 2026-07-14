// Whether Drive is set up (env) and connected (refresh token stored) — drives the
// "Connect Google Drive" / "Connected as …" UI on the Auto-Recreate page.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { driveStatus } from "@/lib/drive";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await driveStatus());
}
