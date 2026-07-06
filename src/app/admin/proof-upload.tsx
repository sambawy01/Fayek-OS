"use client";

import { useState } from "react";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function safeName(name: string): string {
  return (name || "proof").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "proof";
}

const MAX_DIM = 2000;         // downscale so the longest edge is <= this
const COMPRESS_OVER = 1_000_000; // only bother compressing images above ~1 MB

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Shrink large images (downscale to MAX_DIM, re-encode as WebP/JPEG ~0.82) so a
 * multi-MB screenshot uploads as a few hundred KB. Returns the original file for
 * PDFs, small images, or if compression can't beat the original.
 */
async function maybeCompress(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  const orig = { blob: file, type: file.type, ext: EXT[file.type] };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= COMPRESS_OVER) return orig;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return orig;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    let out = await encode(canvas, "image/webp", 0.82);
    let type = "image/webp", ext = "webp";
    if (!out) { out = await encode(canvas, "image/jpeg", 0.82); type = "image/jpeg"; ext = "jpg"; }
    if (!out || out.size >= file.size) return orig;
    return { blob: out, type, ext };
  } catch {
    return orig;
  }
}

/**
 * Bank-transfer / cheque proof upload (image or PDF). Uploads the file DIRECTLY
 * from the browser to Vercel Blob (via a token minted by /api/admin/payment-proof)
 * so large screenshots aren't rejected by the serverless request-body limit.
 * Returns the public Blob URL.
 */
export function ProofField({
  value, onUploaded, onError, onUploadingChange, label = "Proof of payment",
}: {
  value: string;
  onUploaded: (url: string) => void;
  onError: (msg: string) => void;
  /** Reports upload in-flight state so callers can block submit until it's done. */
  onUploadingChange?: (uploading: boolean) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const setBusy = (b: boolean) => { setUploading(b); onUploadingChange?.(b); };

  async function handle(file: File) {
    if (!EXT[file.type]) return onError("Proof must be a JPEG, PNG, WebP or PDF.");
    setBusy(true);
    try {
      // Compress large images client-side; PDFs pass through unchanged.
      const { blob, type, ext } = await maybeCompress(file);
      if (blob.size > 4 * 1024 * 1024) {
        return onError(
          type === "application/pdf"
            ? "PDF proof is too large (max 4 MB). Please compress it or upload an image."
            : "Proof is still too large after compression. Please use a smaller image."
        );
      }
      const data = new FormData();
      data.append("file", new File([blob], `${safeName(file.name)}.${ext}`, { type }));
      const res = await fetch("/api/admin/payment-proof", { method: "POST", body: data });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        return onError(d.error ?? "Upload failed.");
      }
      const { url } = (await res.json()) as { url: string };
      onUploaded(url);
    } catch {
      onError("Upload failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-[#5B7186]">
        {label} <span className="text-[#CC4038]">*</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }}
          className="block w-full text-xs text-[#5B7186] file:mr-2 file:rounded-md file:border-0 file:bg-[#E4EEFA] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[#1668C7] hover:file:bg-[#D6E4F5]"
        />
        {uploading && <span className="whitespace-nowrap text-xs text-[#5B7186]">Uploading…</span>}
        {value && !uploading && (
          <a href={value} target="_blank" rel="noreferrer" className="whitespace-nowrap text-xs font-medium text-[#0E7490] underline">attached ✓</a>
        )}
      </div>
    </div>
  );
}
