// Minimal, APPEND-ONLY Airtable client for the Auto-Recreate pipeline.
//
// SAFETY: this module only ever CREATES new records and READS records. It has no
// update/delete helpers on purpose — the CRM must never touch existing rows,
// fields, or structure in the RUNNING-HUB base. It talks to the same base the VPS
// bridge script watches; creating a row with START=true is exactly what a VA does.
//
// Config via env (set on the CRM app): AIRTABLE_TOKEN, AIRTABLE_BASE_ID.
const TOKEN = process.env.AIRTABLE_TOKEN || "";
const BASE = process.env.AIRTABLE_BASE_ID || "";
const API = "https://api.airtable.com/v0";

// Table + control field names (must match config.py in the bridge script).
export const AT_TABLES = { IMAGE_EDIT: "image-edit", MOTION: "Motion-Control" };
export const AT_FIELDS = {
  START: "START",
  STATUS: "STATUS",
  OUTPUT_URL: "OUTPUT_URL",
  IMAGE: "IMAGE",
  PROMPT: "Prompt",
  REEL: "REEL",
};

export function airtableConfigured(): boolean {
  return !!(TOKEN && BASE);
}

async function atFetch(method: string, path: string, body?: any) {
  const res = await fetch(`${API}/${BASE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${data?.error?.message || text.slice(0, 180)}`);
  }
  return data;
}

// Create (append) a new record. Returns the new record id. This is the ONLY write.
export async function createRecord(table: string, fields: Record<string, any>): Promise<string> {
  const data = await atFetch("POST", encodeURIComponent(table), { fields, typecast: true });
  return data.id as string;
}

// Read a single record's fields.
export async function getRecord(table: string, id: string): Promise<Record<string, any>> {
  const data = await atFetch("GET", `${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
  return data.fields || {};
}

// Helper: shape a public/presigned URL as an Airtable attachment value.
export function attach(url: string) {
  return [{ url }];
}
