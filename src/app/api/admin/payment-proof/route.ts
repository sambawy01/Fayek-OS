import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireCapability } from "@/lib/auth/session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/admin/payment-proof — issues a short-lived client token so the
 * browser uploads the proof (bank-transfer receipt or cheque, image or PDF)
 * DIRECTLY to Blob under `proofs/`. This bypasses the ~4.5 MB serverless
 * request-body limit that a multipart upload through this route hit — full-page
 * screenshots routinely exceed it, which silently failed the upload. The file
 * bytes never pass through this function; only the token handshake does.
 *
 * Finance-scoped (owner/admin).
 */
export async function POST(request: Request) {
  const guard = await requireCapability("finance.view");
  if ("error" in guard) return guard.error;

  const token = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Uploads are not configured (no Blob token)." }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
      }),
      // The client receives the blob URL directly from upload(); this webhook is
      // best-effort (and isn't reachable on localhost), so we no-op.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
