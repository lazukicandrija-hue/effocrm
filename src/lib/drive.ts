// Google Drive delivery for finished reels. Uses a Google service account
// (server-to-server, no interactive OAuth). Configure via env on the CRM app:
//   GOOGLE_SERVICE_ACCOUNT_JSON  the full service-account JSON key (one line)
//   GOOGLE_DRIVE_FOLDER_ID       the Drive folder to drop reels into (shared
//                                with the service account's email as Editor)
//
// Scope is drive.file — the account can only touch files it creates, never the
// rest of the user's Drive. Auth is a self-signed JWT exchanged for an access
// token (cached until ~1 min before expiry). No extra npm dependencies.
import crypto from "crypto";

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

export function driveConfigured(): boolean {
  return !!SA_JSON && !!FOLDER_ID;
}

function serviceAccount(): { client_email: string; private_key: string } {
  const sa = JSON.parse(SA_JSON);
  if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing client_email/private_key");
  return sa;
}

let cached: { token: string; expMs: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expMs > Date.now() + 60_000) return cached.token;
  const { client_email, private_key } = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const input = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(input), private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${input}.${sig}`,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Drive auth failed: ${data.error_description || data.error || res.status}`);
  cached = { token: data.access_token, expMs: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

// Upload bytes we already hold to the configured Drive folder. Returns a
// shareable Drive link. Multipart upload — fine for reel-sized files (a few MB).
export async function uploadToDrive(
  name: string,
  bytes: Buffer,
  mimeType = "video/mp4"
): Promise<{ id: string; link: string }> {
  const token = await accessToken();
  const boundary = "efrt" + crypto.randomBytes(8).toString("hex");
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({ name, parents: [FOLDER_ID] })}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(120_000),
    }
  );
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Drive upload failed: ${JSON.stringify(data).slice(0, 200)}`);
  return { id: data.id, link: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view` };
}
