// API: poll a Captioner job. Proxies the async caption service and returns
// { status: pending|processing|done|error|gone, url?, words?, error? }.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { klingCaptionPoll } from "@/lib/recreate";

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const res = await klingCaptionPoll(params.jobId);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: e instanceof Error ? e.message : "poll failed" },
      { status: 502 }
    );
  }
}
