import { readFile } from "node:fs/promises";
import { join } from "node:path";
import PDFDocument from "pdfkit";

/**
 * Shared branded-PDF chrome for Fayek Abrasives documents (quotations, the
 * inventory report, …): embedded OFL fonts (PT Sans/Serif + Amiri for Arabic),
 * a white header with the real logo + green accent rule, and a footer with the
 * company contacts. `createBrandedDoc` returns a ready PDFDocument with the
 * header/footer drawn on every page and the content geometry callers need.
 */

const LOGO_URL = "https://www.fayekabrasives.com/assets/images/logo.jpg";
const BRAND_NAME = "FAYEK ABRASIVES";
const FOOTER_TEXT = "www.fayekabrasives.com  ·  info@ftc-eg.com  ·  +20 2 2415 6092";

export const INK = "#3A332C";
export const MUTED = "#847866";
export const HAIRLINE = "#E5DCCB";
export const ACCENT = "#357F75";
export const PANEL = "#F5F0E6";

export const PAGE_MARGIN = 56;
export const BAND_HEIGHT = 110;
export const BOTTOM_MARGIN = 78;

export const NO_LIGATURES = {
  liga: false, clig: false, dlig: false, hlig: false,
} as unknown as PDFKit.Mixins.TextOptions["features"];

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const hasArabic = (t: string) => ARABIC_RE.test(t);

export const money = (n: number) =>
  Math.round(n).toLocaleString("en-EG", { maximumFractionDigits: 0 });

export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo", day: "numeric", month: "long", year: "numeric",
  }).format(d);
}
export function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}
export function fmtDateISO(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmtDate(d);
}

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");
const FONT_FILES = {
  Sans: "PT_Sans-Web-Regular.ttf",
  "Sans-Bold": "PT_Sans-Web-Bold.ttf",
  Serif: "PT_Serif-Web-Regular.ttf",
  Arabic: "Amiri-Regular.ttf",
  "Arabic-Bold": "Amiri-Bold.ttf",
} as const;
type FontName = keyof typeof FONT_FILES;

let fontCache: Record<FontName, Buffer> | null = null;
async function loadFonts(): Promise<Record<FontName, Buffer>> {
  if (fontCache) return fontCache;
  const entries = await Promise.all(
    (Object.keys(FONT_FILES) as FontName[]).map(async (name) =>
      [name, await readFile(join(FONT_DIR, FONT_FILES[name]))] as const
    )
  );
  fontCache = Object.fromEntries(entries) as Record<FontName, Buffer>;
  return fontCache;
}

async function loadLogo(): Promise<Buffer | null> {
  try {
    const res = await fetch(LOGO_URL, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch { /* fall through */ }
  try {
    return await readFile(join(process.cwd(), "public", "logo.png"));
  } catch {
    return null;
  }
}

export interface BrandedDoc {
  doc: PDFKit.PDFDocument;
  done: Promise<Buffer>;
  pageWidth: number;
  x0: number;
  contentWidth: number;
  contentRight: number;
  /** Y of the first content line under the header. */
  topY: number;
}

/** Create an A4 PDFDocument with the branded header + footer on every page. */
export async function createBrandedDoc(opts: { title: string; now?: Date }): Promise<BrandedDoc> {
  const [logo, fonts] = await Promise.all([loadLogo(), loadFonts()]);
  // Captured once so every page carries the same generation signature.
  const generatedStamp = `Generated ${fmtDateTime(opts.now ?? new Date())} · Africa/Cairo`;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: BAND_HEIGHT + 44, bottom: BOTTOM_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    font: null as unknown as string,
    info: { Title: opts.title, Author: "Fayek Abrasives" },
  });
  doc.registerFont("Sans", fonts.Sans);
  doc.registerFont("Sans-Bold", fonts["Sans-Bold"]);
  doc.registerFont("Serif", fonts.Serif);
  doc.registerFont("Arabic", fonts.Arabic);
  doc.registerFont("Arabic-Bold", fonts["Arabic-Bold"]);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageWidth = doc.page.width;
  const x0 = PAGE_MARGIN;
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const contentRight = x0 + contentWidth;

  const drawBandAndFooter = () => {
    const savedX = doc.x, savedY = doc.y, savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    if (logo) {
      const box = 84;
      doc.image(logo, (pageWidth - box) / 2, (BAND_HEIGHT - box) / 2, { fit: [box, box], align: "center", valign: "center" });
    } else {
      doc.font("Sans-Bold").fontSize(16).fillColor(INK)
        .text(BRAND_NAME, PAGE_MARGIN, BAND_HEIGHT / 2 - 9, { width: contentWidth, align: "center", characterSpacing: 2.5, features: NO_LIGATURES });
    }
    doc.moveTo(PAGE_MARGIN, BAND_HEIGHT - 2).lineTo(pageWidth - PAGE_MARGIN, BAND_HEIGHT - 2)
      .lineWidth(2).strokeColor(ACCENT).stroke();
    const footerY = doc.page.height - 64;
    doc.moveTo(PAGE_MARGIN, footerY).lineTo(pageWidth - PAGE_MARGIN, footerY).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
    doc.font("Sans").fontSize(9).fillColor(MUTED)
      .text(FOOTER_TEXT, PAGE_MARGIN, footerY + 12, { width: contentWidth, align: "center", characterSpacing: 0.5, features: NO_LIGATURES });
    doc.font("Sans").fontSize(8).fillColor(MUTED)
      .text(generatedStamp, PAGE_MARGIN, footerY + 26, { width: contentWidth, align: "center", characterSpacing: 0.3, features: NO_LIGATURES });
    doc.restore();
    doc.page.margins.bottom = savedBottom;
    doc.x = savedX; doc.y = savedY;
  };
  drawBandAndFooter();
  doc.on("pageAdded", drawBandAndFooter);

  return { doc, done, pageWidth, x0, contentWidth, contentRight, topY: BAND_HEIGHT + 40 };
}
