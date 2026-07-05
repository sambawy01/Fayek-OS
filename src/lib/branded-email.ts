/**
 * Shared branded HTML email shell — the owner's brand on EVERY email.
 *
 * Layout (matches the buyer-confirmation email that defined the pattern):
 * - Dark band header (#100D0B) with the brand wordmark, table-based so it
 *   renders in Outlook/Gmail (bgcolor attribute + inline styles, no external
 *   CSS). NOTE (Track B): once a logo file exists, swap the wordmark <td> for
 *   an <img src="https://www.fayekabrasives.com/assets/logo.png" …>.
 * - "Earthen Calm" palette: #F4EFE7 canvas, #FFFDF9 card, #E5DCCB hairlines,
 *   #3A332C ink, #847866 muted, Georgia serif.
 * - Card with the brand kicker line + heading, then template-specific content.
 *
 * Builders pass in already-safe HTML (escape data with `escapeHtml`).
 * Text parts stay plain — this module only owns the HTML shell.
 */

const BRAND_NAME = "Fayek Abrasives";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BrandedEmailOptions {
  /** Card heading (plain text — escaped here). */
  heading: string;
  /** Template-specific inner HTML (already escaped by the builder). */
  contentHtml: string;
  /** Optional small print rendered under the card (already escaped). */
  belowCardHtml?: string;
}

/** Full HTML document: dark logo band + Earthen Calm card around the content. */
export function brandedEmailHtml(options: BrandedEmailOptions): string {
  const { heading, contentHtml, belowCardHtml } = options;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#F4EFE7;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;">
      <tr>
        <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:28px 24px 22px;border:1px solid #E5DCCB;border-bottom:3px solid #357F75;border-radius:16px 16px 0 0;">
          <img src="https://www.fayekabrasives.com/assets/images/logo.jpg" width="118" alt="${BRAND_NAME}" style="display:block;width:118px;height:auto;border:0;margin:0 auto;" />
        </td>
      </tr>
    </table>
    <div style="background-color:#FFFDF9;border:1px solid #E5DCCB;border-top:0;border-radius:0 0 16px 16px;padding:32px;">
      <p style="margin:0 0 4px;color:#847866;font-size:12px;text-transform:uppercase;letter-spacing:0.2em;">${BRAND_NAME}</p>
      <h1 style="margin:0 0 24px;color:#3A332C;font-size:26px;font-weight:normal;">${escapeHtml(heading)}</h1>
      ${contentHtml}
    </div>${
      belowCardHtml
        ? `\n    <p style="margin:16px 8px 0;color:#847866;font-size:12px;">${belowCardHtml}</p>`
        : ""
    }
  </div>
</body>
</html>`;
}
