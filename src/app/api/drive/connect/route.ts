// Kicks off Google Drive OAuth: sends the logged-in user to Google's consent
// screen. The button on the Auto-Recreate page links here.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consentUrl, driveEnvReady } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const base = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/$/, "");
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(`${base}/login`);
  if (!driveEnvReady()) return NextResponse.redirect(`${base}/auto-recreate?drive=notconfigured`);
  return NextResponse.redirect(consentUrl());
}
