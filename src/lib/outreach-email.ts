/**
 * Branded outreach email helpers, shared by the manual "Personalize" route and
 * the daily prospecting agent. Wraps a message body (WITHOUT the sign-off) in
 * the branded HTML shell (white logo header + brand palette), and builds the
 * plain-text sign-off with the sender's signature.
 */
import { brandedEmailHtml, escapeHtml } from "./branded-email";

const CONTACTS = "info@ftc-eg.com · +20 2 2415 6092";

export function signOff(signature: string): string {
  const who = signature.trim();
  return `\n\nWarm regards,\n${who ? `${who}\n` : ""}Fayek Abrasives\n${CONTACTS}`;
}

export function brandedOutreachHtml(subject: string, bodyNoSign: string, signature: string): string {
  const contentHtml = bodyNoSign
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;color:#3A332C;font-size:15px;line-height:1.6;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`
    )
    .join("\n      ");

  const sig = signature.trim();
  const sigLine = sig
    ? `<strong style="color:#3A332C;">${escapeHtml(sig).replace(/\n/g, "<br />")}</strong><br />`
    : "";
  const belowCardHtml =
    `Warm regards,<br />${sigLine}` +
    `<strong style="color:#3A332C;">Fayek Abrasives</strong><br />` +
    `<a href="mailto:info@ftc-eg.com" style="color:#357F75;text-decoration:none;">info@ftc-eg.com</a> &middot; ` +
    `+20 2 2415 6092 &middot; ` +
    `<a href="https://www.fayekabrasives.com" style="color:#357F75;text-decoration:none;">fayekabrasives.com</a>`;

  return brandedEmailHtml({ heading: subject, contentHtml, belowCardHtml });
}
