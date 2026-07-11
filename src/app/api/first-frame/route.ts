// API: fast "first frame" of a reel. Accepts JSON { url } or a multipart file
// upload, forwards to the prompt service's /first-frame endpoints, and returns the
// opening frame as base64. No slow analysis — seconds, not minutes. Server-side so
// the API secret never reaches the browser. (Uploaded files are usually handled in
// the browser; this multipart path is a fallback for formats the browser can't read.)
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const API_URL = (process.env.SEEDANCE_API_URL || "").replace(/\/$/, "");
const API_SECRET = process.env.SEEDANCE_API_SECRET || "";
const MAX_UPLOAD = 60 * 1024 * 1024; // 60 MB — reels are small

function authHeaders(extra?: Record<string, string>) {
  return { ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}), ...(extra || {}) };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!API_URL) {
    return NextResponse.json(
      { error: "The prompt service isn't connected yet (SEEDANCE_API_URL not set)." },
      { status: 503 }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  try {
    // ── Uploaded file (fallback path) ──
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string")
        return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      if (file.size === 0)
        return NextResponse.json({ error: "That file is empty." }, { status: 400 });
      if (file.size > MAX_UPLOAD)
        return NextResponse.json(
          { error: `File too large (max ${MAX_UPLOAD / 1024 / 1024} MB).` },
          { status: 413 }
        );
      const fwd = new FormData();
      fwd.append("file", file, file.name || "upload.mp4");
      const res = await fetch(`${API_URL}/first-frame/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: fwd,
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const d = await res.text().catch(() => "");
        return NextResponse.json(
          { error: `Prompt service error (${res.status}). ${d.slice(0, 200)}` },
          { status: 502 }
        );
      }
      const j = await res.json();
      return NextResponse.json({ image: j.first_frame, contentType: j.content_type || "image/jpeg" });
    }

    // ── Pasted URL ──
    const body = await req.json().catch(() => ({} as any));
    const url = body?.url;
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
      return NextResponse.json({ error: "Paste a valid reel or video URL (https://…)." }, { status: 400 });
    }
    const res = await fetch(`${API_URL}/first-frame`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: url.trim() }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const d = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Prompt service error (${res.status}). ${d.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const j = await res.json();
    return NextResponse.json({ image: j.first_frame, contentType: j.content_type || "image/jpeg" });
  } catch (e: any) {
    const msg =
      e?.name === "TimeoutError"
        ? "That took too long — try again, or upload the file instead."
        : e?.message || "Couldn't get the first frame.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
