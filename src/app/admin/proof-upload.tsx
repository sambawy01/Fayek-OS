"use client";

import { useState } from "react";

/** Bank-transfer / cheque proof upload (image or PDF) → Blob, returns the URL. */
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
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) {
      return onError("Proof must be a JPEG, PNG, WebP or PDF.");
    }
    if (file.size > 8 * 1024 * 1024) return onError("Proof must be at most 8 MB.");
    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
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
