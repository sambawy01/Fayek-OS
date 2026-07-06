"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function safeName(name: string): string {
  return (name || "proof").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "proof";
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
    const ext = EXT[file.type];
    if (!ext) return onError("Proof must be a JPEG, PNG, WebP or PDF.");
    if (file.size > 8 * 1024 * 1024) return onError("Proof must be at most 8 MB.");
    setBusy(true);
    try {
      const blob = await upload(`proofs/${safeName(file.name)}.${ext}`, file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/api/admin/payment-proof",
      });
      onUploaded(blob.url);
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
