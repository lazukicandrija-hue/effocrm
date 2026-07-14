// Google redirects here after consent. Exchange the code for a refresh token,
// store it, and bounce back to the Auto-Recreate page with a status flag.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exchangeCode } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const base = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/$/, "");
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(`${base}/login`);

  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) return NextResponse.redirect(`${base}/auto-recreate?drive=error&msg=${encodeURIComponent(err)}`);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${base}/auto-recreate?drive=error&msg=nocode`);

  try {
    await exchangeCode(code);
    return NextResponse.redirect(`${base}/auto-recreate?drive=connected`);
  } catch (e: any) {
    return NextResponse.redirect(
      `${base}/auto-recreate?drive=error&msg=${encodeURIComponent(e?.message || "failed")}`
    );
  }
}
