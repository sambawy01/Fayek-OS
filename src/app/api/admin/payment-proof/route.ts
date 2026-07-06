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
// Kept under Vercel's ~4.5 MB serverless request-body limit; the client
// compresses images below this before upload.
const MAX_BYTES = 4 * 1024 * 1024;

function safeName(name: string): string {
  return (name || "proof").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "proof";
}

/**
 * POST /api/admin/payment-proof — upload a proof of payment (bank-transfer
 * receipt or cheque, image or PDF) to the PRIVATE Blob store under `proofs/`.
 * Returns { url } pointing at the auth-gated proxy (the store is private-only,
 * so public URLs aren't possible — same pattern as product photos). Finance-
 * scoped (owner/admin). Images are compressed client-side first, so the
 * multipart body stays well under the serverless request-body limit.
 */
export async function POST(request: Request) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;

  // Use the default store token — the media-file proxy reads private blobs with
  // this same token, so uploading here guarantees the proof is readable back.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
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
    return NextResponse.json({ error: "File must be between 1 byte and 4 MB (compress large PDFs)." }, { status: 400 });
  }

  try {
    const blob = await put(`proofs/${safeName(file.name)}-${file.size}.${ext}`, file, {
      access: "private", // store is private-only; served via the media-file proxy
      contentType: file.type,
      addRandomSuffix: true,
      token,
    });
    // Auth-gated proxy URL (works with the session cookie); the store has no
    // public URLs. Reuses the existing private-blob streamer.
    const url = `/api/admin/media/file?p=${encodeURIComponent(blob.pathname)}`;
    return NextResponse.json({ url, pathname: blob.pathname }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
  }
}
