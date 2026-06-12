// API: generate a Seedance "recreate" prompt for a reel by calling the prompt service.
// Server-side so the API secret never reaches the browser. The prompt service does the
// heavy work (download via proxy/cookie + TwelveLabs/Whisper/OpenRouter), ~1-3 min.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!API_URL) {
    return NextResponse.json(
      { error: "The prompt service isn't connected yet (SEEDANCE_API_URL not set)." },
      { status: 503 }
    );
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing reel url." }, { status: 400 });
    }

    const res = await fetch(`${API_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(240000), // analysis can take a couple of minutes
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Prompt service error (${res.status}). ${detail.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ prompt: data.prompt, description: data.description });
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "The prompt took too long — try again." : e?.message || "Failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
