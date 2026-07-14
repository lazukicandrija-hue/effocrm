// DigitalOcean Spaces (S3-compatible) helper for the Bad Outputs video storage.
// Configure via env vars on the app:
//   SPACES_REGION   e.g. "fra1"
//   SPACES_BUCKET   e.g. "effortless-crm-media"
//   SPACES_KEY      the Spaces access key
//   SPACES_SECRET   the Spaces secret key
//   SPACES_ENDPOINT (optional) defaults to https://<region>.digitaloceanspaces.com
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const SPACES_REGION = process.env.SPACES_REGION || "fra1";
export const SPACES_BUCKET = process.env.SPACES_BUCKET || "";
export const SPACES_KEY = process.env.SPACES_KEY || "";
export const SPACES_SECRET = process.env.SPACES_SECRET || "";
export const SPACES_ENDPOINT =
  process.env.SPACES_ENDPOINT || `https://${SPACES_REGION}.digitaloceanspaces.com`;

// True once the bucket + keys are wired up. Routes return a friendly 503 until then.
export function spacesConfigured(): boolean {
  return !!(SPACES_BUCKET && SPACES_KEY && SPACES_SECRET);
}

// A short-lived signed GET URL for an object — used to hand a private Spaces file
// (reel / first frame) to Airtable, which fetches + copies it immediately.
export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    spaces(),
    new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }),
    { expiresIn }
  );
}

// Store bytes we already hold in memory (e.g. a finished reel downloaded from
// RunningHub) as a permanent private object. Served later via presignGet.
export async function putBuffer(
  key: string,
  body: Buffer,
  contentType = "application/octet-stream"
): Promise<string> {
  await spaces().send(
    new PutObjectCommand({ Bucket: SPACES_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

let _client: S3Client | null = null;
export function spaces(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: SPACES_REGION,
      endpoint: SPACES_ENDPOINT,
      credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET },
      forcePathStyle: false,
    });
  }
  return _client;
}
