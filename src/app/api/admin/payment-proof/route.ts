import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireCapability } from "@/lib/auth/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 8 * 1024 * 1024;

function safeName(name: string): string {
  return (name || "proof").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "proof";
}

/**
 * POST /api/admin/payment-proof — upload a proof of payment (bank-transfer
 * receipt or cheque, image or PDF) to Blob under `proofs/`. Returns { url }.
 * Finance-scoped (owner/admin).
 */
export async function POST(request: Request) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;

  const token = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Uploads are not configured (no Blob token)." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form with a `file` field." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file`." }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Proof must be a JPEG, PNG, WebP or PDF." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be between 1 byte and 8 MB." }, { status: 400 });
  }

  try {
    const blob = await put(`proofs/${safeName(file.name)}-${file.size}.${ext}`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
      token,
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}
