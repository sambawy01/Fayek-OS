import {
  createBrandedDoc, INK, MUTED, HAIRLINE, ACCENT, PANEL, PAGE_MARGIN,
  BAND_HEIGHT, BOTTOM_MARGIN, NO_LIGATURES, hasArabic, money, fmtDate, fmtDateISO,
} from "./pdf-brand";

/**
 * Corporate INVOICE PDF for Fayek Abrasives — mirrors the quotation layout but
 * with invoice meta (invoice no., issue date, due date) and payment terms. Sent
 * to the customer after a PO is invoiced. Uses the shared branded chrome.
 */

const BRAND_NAME = "FAYEK ABRASIVES";

export interface InvoiceLine {
  name: string;
  qty: number;
  unitPriceEgp: number;
}
export interface InvoicePdfInput {
  invoiceNo: string;
  companyName: string;
  lines: InvoiceLine[];
  totalEgp: number;
  dueDate?: string | null;
  notes?: string;
  now?: Date;
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const now = input.now ?? new Date();
  const { doc, done, x0, contentWidth, contentRight } = await createBrandedDoc({
    title: `Invoice ${input.invoiceNo}`,
  });

  // --- Title + meta -----------------------------------------------------------
  let y = BAND_HEIGHT + 40;
  doc.font("Sans-Bold").fontSize(24).fillColor(INK)
    .text("INVOICE", x0, y, { characterSpacing: 2, features: NO_LIGATURES });
  const metaRows: [string, string][] = [
    ["Invoice No.", input.invoiceNo],
    ["Issue Date", fmtDate(now)],
    ["Due Date", input.dueDate ? fmtDateISO(input.dueDate) : "On receipt"],
  ];
  let my = y + 2;
  for (const [k, v] of metaRows) {
    doc.font("Sans").fontSize(9).fillColor(MUTED)
      .text(k.toUpperCase(), contentRight - 260, my, { width: 120, align: "right", characterSpacing: 1, features: NO_LIGATURES });
    doc.font("Sans-Bold").fontSize(10).fillColor(INK)
      .text(v, contentRight - 130, my - 1, { width: 130, align: "right", features: NO_LIGATURES });
    my += 16;
  }
  y = Math.max(y + 40, my + 6);

  // --- From / Bill-to panels --------------------------------------------------
  doc.roundedRect(x0, y, contentWidth, 66, 6).fill(PANEL);
  const colW = (contentWidth - 24) / 2;
  doc.font("Sans").fontSize(8.5).fillColor(MUTED)
    .text("FROM", x0 + 12, y + 12, { characterSpacing: 1.4, features: NO_LIGATURES });
  doc.font("Sans-Bold").fontSize(11).fillColor(INK)
    .text(BRAND_NAME, x0 + 12, y + 24, { width: colW, features: NO_LIGATURES });
  doc.font("Serif").fontSize(9).fillColor(MUTED)
    .text("Abrasives & Filtration Solutions · Cairo, Egypt", x0 + 12, y + 40, { width: colW, features: NO_LIGATURES });
  const toX = x0 + 12 + colW + 24;
  const toName = input.companyName || "Valued Customer";
  const toAr = hasArabic(toName);
  doc.font("Sans").fontSize(8.5).fillColor(MUTED)
    .text("BILL TO", toX, y + 12, { characterSpacing: 1.4, features: NO_LIGATURES });
  doc.font(toAr ? "Arabic-Bold" : "Sans-Bold").fontSize(11).fillColor(INK)
    .text(toName, toX, y + 24, { width: colW - 12, align: toAr ? "right" : "left", ...(toAr ? {} : { features: NO_LIGATURES }) });
  y += 66 + 18;

  // --- Items table ------------------------------------------------------------
  const wNum = 26, wQty = 50, wUnit = 100, wAmt = 110;
  const wDesc = contentWidth - wNum - wQty - wUnit - wAmt;
  const xNum = x0, xDesc = x0 + wNum, xQty = xDesc + wDesc, xUnit = xQty + wQty, xAmt = xUnit + wUnit;
  const padV = 7;

  const drawHeader = (hy: number): number => {
    doc.rect(x0, hy, contentWidth, 24).fill(ACCENT);
    doc.font("Sans-Bold").fontSize(8.5).fillColor("#FFFDF9");
    const ty = hy + 8;
    doc.text("#", xNum + 4, ty, { width: wNum - 4, features: NO_LIGATURES });
    doc.text("DESCRIPTION", xDesc + 4, ty, { width: wDesc - 8, characterSpacing: 0.6, features: NO_LIGATURES });
    doc.text("QTY", xQty, ty, { width: wQty - 6, align: "right", features: NO_LIGATURES });
    doc.text("UNIT (EGP)", xUnit, ty, { width: wUnit - 6, align: "right", features: NO_LIGATURES });
    doc.text("AMOUNT (EGP)", xAmt, ty, { width: wAmt - 6, align: "right", features: NO_LIGATURES });
    return hy + 24;
  };

  y = drawHeader(y);
  let idx = 1;
  for (const line of input.lines) {
    const nameAr = hasArabic(line.name);
    doc.font(nameAr ? "Arabic" : "Serif").fontSize(10);
    const descH = doc.heightOfString(line.name, { width: wDesc - 8 });
    const rowH = Math.max(descH, 12) + padV * 2;
    if (y + rowH > doc.page.height - BOTTOM_MARGIN) {
      doc.addPage();
      y = drawHeader(BAND_HEIGHT + 40);
    }
    if (idx % 2 === 0) { doc.rect(x0, y, contentWidth, rowH).fill(PANEL); }
    const cy = y + padV;
    doc.font("Sans").fontSize(9.5).fillColor(MUTED).text(String(idx), xNum + 4, cy + 1, { width: wNum - 4, features: NO_LIGATURES });
    doc.font(nameAr ? "Arabic" : "Serif").fontSize(10).fillColor(INK)
      .text(line.name, xDesc + 4, cy, { width: wDesc - 8, align: nameAr ? "right" : "left", ...(nameAr ? {} : { features: NO_LIGATURES }) });
    doc.font("Sans").fontSize(10).fillColor(INK);
    doc.text(money(line.qty), xQty, cy, { width: wQty - 6, align: "right", features: NO_LIGATURES });
    doc.text(money(line.unitPriceEgp), xUnit, cy, { width: wUnit - 6, align: "right", features: NO_LIGATURES });
    doc.font("Sans-Bold").fontSize(10).fillColor(INK)
      .text(money(line.qty * line.unitPriceEgp), xAmt, cy, { width: wAmt - 6, align: "right", features: NO_LIGATURES });
    y += rowH;
    doc.moveTo(x0, y).lineTo(contentRight, y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
    idx++;
  }

  // --- Total ------------------------------------------------------------------
  y += 10;
  const totalBoxW = wUnit + wAmt;
  const totalBoxX = contentRight - totalBoxW;
  doc.rect(totalBoxX, y, totalBoxW, 30).fill(INK);
  doc.font("Sans-Bold").fontSize(10).fillColor("#FFFDF9")
    .text("TOTAL DUE", totalBoxX + 12, y + 10, { width: 90, characterSpacing: 1, features: NO_LIGATURES });
  doc.font("Sans-Bold").fontSize(13).fillColor("#FFFDF9")
    .text(`${money(input.totalEgp)} EGP`, totalBoxX, y + 8, { width: totalBoxW - 12, align: "right", features: NO_LIGATURES });
  y += 30 + 18;

  // --- Notes ------------------------------------------------------------------
  if (input.notes && input.notes.trim()) {
    const notesAr = hasArabic(input.notes);
    doc.font("Sans-Bold").fontSize(9).fillColor(MUTED)
      .text("NOTES", x0, y, { characterSpacing: 1.2, features: NO_LIGATURES });
    y = doc.y + 4;
    doc.font(notesAr ? "Arabic" : "Serif").fontSize(10).fillColor(INK)
      .text(input.notes.trim(), x0, y, { width: contentWidth, lineGap: 3, align: notesAr ? "right" : "left", ...(notesAr ? {} : { features: NO_LIGATURES }) });
    y = doc.y + 18;
  }

  // --- Payment terms ----------------------------------------------------------
  const dueText = input.dueDate ? fmtDateISO(input.dueDate) : "on receipt of this invoice";
  const terms = [
    `All amounts are in Egyptian Pounds (EGP) and are exclusive of VAT unless expressly stated otherwise.`,
    `Payment is due ${dueText}. Please send proof of payment (bank transfer receipt or cheque) once settled.`,
    `Goods are released for dispatch only after payment is received (or on approved credit terms for trusted accounts).`,
    `Goods remain the property of Fayek Abrasives until payment has been received in full.`,
  ];
  if (y + 130 > doc.page.height - BOTTOM_MARGIN) { doc.addPage(); y = BAND_HEIGHT + 40; }
  doc.font("Sans-Bold").fontSize(9).fillColor(MUTED)
    .text("PAYMENT TERMS", x0, y, { characterSpacing: 1.2, features: NO_LIGATURES });
  y = doc.y + 6;
  doc.font("Serif").fontSize(9).fillColor(INK);
  let ti = 1;
  for (const t of terms) {
    doc.text(`${ti}.  ${t}`, x0, y, { width: contentWidth, lineGap: 2, features: NO_LIGATURES });
    y = doc.y + 4;
    ti++;
  }

  doc.end();
  return done;
}
