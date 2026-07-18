// Google Drive delivery for finished reels, via OAuth as the user (not a service
// account — those can't upload to a personal Gmail Drive). The user clicks
// "Connect Google Drive" once; we store the refresh token and upload reels into
// their folder, owned by them. Configure via env on the CRM app:
//   GOOGLE_OAUTH_CLIENT_ID      OAuth 2.0 Web client id
//   GOOGLE_OAUTH_CLIENT_SECRET  its secret
//   GOOGLE_DRIVE_FOLDER_ID      the Drive folder to drop reels into
// Scope is drive.file (per-file; can't see the rest of the user's Drive).
import prisma from "@/lib/prisma";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

// True once the three env values are present (i.e. the OAuth app exists).
export function driveEnvReady(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && FOLDER_ID);
}

export function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return `${base}/api/drive/callback`;
}

// The Google consent URL the "Connect Google Drive" button sends the user to.
export function consentUrl(): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force refresh_token even on re-connect
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// Exchange the callback code for tokens and persist the refresh token.
export async function exchangeCode(code: string): Promise<{ email: string | null }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error_description || d.error || `token exchange failed (${res.status})`);
  if (!d.refresh_token) {
    throw new Error("Google didn't return a refresh token — remove the app at myaccount.google.com/permissions and reconnect.");
  }
  let email: string | null = null;
  try {
    const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${d.access_token}` },
    });
    if (ui.ok) email = (await ui.json()).email ?? null;
  } catch {
    /* email is best-effort */
  }
  await prisma.driveAuth.upsert({
    where: { id: "default" },
    create: { id: "default", refreshToken: d.refresh_token, email },
    update: { refreshToken: d.refresh_token, email },
  });
  return { email };
}

async function storedRefreshToken(): Promise<string | null> {
  const row = await prisma.driveAuth.findUnique({ where: { id: "default" } });
  return row?.refreshToken || null;
}

// Connected = env present AND a refresh token stored.
export async function driveStatus(): Promise<{ envReady: boolean; connected: boolean; email: string | null }> {
  const envReady = driveEnvReady();
  if (!envReady) return { envReady, connected: false, email: null };
  const row = await prisma.driveAuth.findUnique({ where: { id: "default" } });
  return { envReady, connected: !!row?.refreshToken, email: row?.email ?? null };
}

let cached: { token: string; expMs: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expMs > Date.now() + 60000) return cached.token;
  const rt = await storedRefreshToken();
  if (!rt) throw new Error("Drive not connected");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: rt,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error_description || d.error || `refresh failed (${res.status})`);
  cached = { token: d.access_token, expMs: Date.now() + d.expires_in * 1000 };
  return d.access_token;
}

// Find (or create) a subfolder by name under a parent. Used to group reels into
// a folder per day so they don't pile up in one place. drive.file scope only
// sees folders the app itself created — which is exactly these day folders.
async function findOrCreateFolder(name: string, parentId: string, token: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }
  );
  const ld: any = await list.json().catch(() => ({}));
  if (list.ok && Array.isArray(ld.files) && ld.files.length) return ld.files[0].id;
  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    signal: AbortSignal.timeout(20000),
  });
  const cd: any = await create.json().catch(() => ({}));
  if (!create.ok) throw new Error(`create folder failed: ${JSON.stringify(cd).slice(0, 150)}`);
  return cd.id;
}

// Upload bytes to the configured folder (optionally into a day subfolder).
// Returns a shareable link, or null when Drive isn't connected.
export async function maybeUploadToDrive(
  name: string,
  bytes: Buffer,
  opts: { mimeType?: string; subfolder?: string } = {}
): Promise<string | null> {
  if (!driveEnvReady()) return null;
  const rt = await storedRefreshToken();
  if (!rt) return null;
  const token = await accessToken();
  const mimeType = opts.mimeType || "video/mp4";

  let parent = FOLDER_ID;
  if (opts.subfolder) {
    try {
      parent = await findOrCreateFolder(opts.subfolder, FOLDER_ID, token);
    } catch {
      parent = FOLDER_ID; // if the day folder can't be made, still deliver to the root
    }
  }

  const boundary = "efrt" + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({ name, parents: [parent] })}\r\n` +
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
      signal: AbortSignal.timeout(120000),
    }
  );
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Drive upload failed: ${JSON.stringify(d).slice(0, 200)}`);
  return d.webViewLink || `https://drive.google.com/file/d/${d.id}/view`;
}
