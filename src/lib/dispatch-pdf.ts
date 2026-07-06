import {
  createBrandedDoc, INK, MUTED, HAIRLINE, ACCENT, PANEL, PAGE_MARGIN,
  BAND_HEIGHT, BOTTOM_MARGIN, NO_LIGATURES, hasArabic, money, fmtDate,
} from "./pdf-brand";

/**
 * Dispatch Order — the factory's record of a batch dispatched to the warehouse.
 * Generated when a dispatch is created; a branded document (logo header) with a
 * numbered header, from/to block, an itemised dispatch table, and a dispatched-
 * by / received-by signature block. Reuses the shared branded chrome.
 */

const STATUS_LABEL: Record<string, string> = {
  dispatched: "Dispatched — awaiting receipt",
  received: "Received in full",
  pending_approval: "Under review (discrepancy)",
  resolved: "Received (adjusted)",
  rejected: "Rejected",
};

export interface DispatchLine { code: string; name: string; qty: number }
export interface DispatchPdfInput {
  batchId: number;
  reference: string;
  supplier: string;
  notes: string;
  status: string;
  dispatchedAt: string;
  lines: DispatchLine[];
  now?: Date;
}

export async function renderDispatchPdf(input: DispatchPdfInput): Promise<Buffer> {
  const doNo = `DO-${String(input.batchId).padStart(4, "0")}`;
  const dispatched = input.dispatchedAt ? new Date(input.dispatchedAt) : (input.now ?? new Date());
  const { doc, done, x0, contentWidth, contentRight } = await createBrandedDoc({ title: `Dispatch Order ${doNo}` });

  // --- Title + meta -----------------------------------------------------------
  let y = BAND_HEIGHT + 40;
  doc.font("Sans-Bold").fontSize(22).fillColor(INK)
    .text("DISPATCH ORDER", x0, y, { characterSpacing: 1.5, features: NO_LIGATURES });
  const meta: [string, string][] = [
    ["Dispatch No.", doNo],
    ["Date", fmtDate(dispatched)],
    ["Status", STATUS_LABEL[input.status] ?? input.status],
  ];
  let my = y + 2;
  for (const [k, v] of meta) {
    doc.font("Sans").fontSize(8.5).fillColor(MUTED)
      .text(k.toUpperCase(), contentRight - 300, my, { width: 120, align: "right", characterSpacing: 0.8, features: NO_LIGATURES });
    doc.font("Sans-Bold").fontSize(9.5).fillColor(INK)
      .text(v, contentRight - 175, my - 1, { width: 175, align: "right", features: NO_LIGATURES });
    my += 15;
  }
  y = Math.max(y + 40, my + 6);

  // --- From / To panel --------------------------------------------------------
  doc.roundedRect(x0, y, contentWidth, 66, 6).fill(PANEL);
  const colW = (contentWidth - 24) / 2;
  const from = input.supplier || "Factory";
  const fromAr = hasArabic(from);
  doc.font("Sans").fontSize(8.5).fillColor(MUTED).text("DISPATCHED FROM", x0 + 12, y + 12, { characterSpacing: 1.4, features: NO_LIGATURES });
  doc.font(fromAr ? "Arabic-Bold" : "Sans-Bold").fontSize(11).fillColor(INK)
    .text(from, x0 + 12, y + 24, { width: colW, align: fromAr ? "right" : "left", ...(fromAr ? {} : { features: NO_LIGATURES }) });
  if (input.reference) {
    doc.font("Serif").fontSize(9).fillColor(MUTED).text(`Ref: ${input.reference}`, x0 + 12, y + 42, { width: colW, features: NO_LIGATURES });
  }
  const toX = x0 + 12 + colW + 24;
  doc.font("Sans").fontSize(8.5).fillColor(MUTED).text("DELIVER TO", toX, y + 12, { characterSpacing: 1.4, features: NO_LIGATURES });
  doc.font("Sans-Bold").fontSize(11).fillColor(INK).text("Fayek Abrasives — Warehouse", toX, y + 24, { width: colW - 12, features: NO_LIGATURES });
  doc.font("Serif").fontSize(9).fillColor(MUTED).text("Cairo, Egypt", toX, y + 42, { width: colW - 12, features: NO_LIGATURES });
  y += 66 + 18;

  // --- Intro ------------------------------------------------------------------
  doc.font("Serif").fontSize(10.5).fillColor(INK)
    .text("The following goods have been dispatched to the warehouse for receipt and count. Quantities are confirmed by the warehouse on receipt.", x0, y, { width: contentWidth, lineGap: 3, features: NO_LIGATURES });
  y = doc.y + 12;

  // --- Table ------------------------------------------------------------------
  const wNum = 26, wQty = 110;
  const wCode = 150;
  const wName = contentWidth - wNum - wCode - wQty;
  const xNum = x0, xCode = xNum + wNum, xName = xCode + wCode, xQty = xName + wName;
  const padV = 7;
  const header = (hy: number): number => {
    doc.rect(x0, hy, contentWidth, 22).fill(ACCENT);
    doc.font("Sans-Bold").fontSize(8.5).fillColor("#FFFDF9");
    const ty = hy + 7;
    doc.text("#", xNum + 4, ty, { width: wNum - 4, features: NO_LIGATURES });
    doc.text("CODE", xCode + 2, ty, { width: wCode - 4, features: NO_LIGATURES });
    doc.text("PRODUCT", xName + 2, ty, { width: wName - 4, features: NO_LIGATURES });
    doc.text("QTY DISPATCHED", xQty, ty, { width: wQty - 6, align: "right", features: NO_LIGATURES });
    return hy + 22;
  };
  y = header(y);
  let idx = 1, totalQty = 0;
  for (const l of input.lines) {
    totalQty += l.qty;
    const nameAr = hasArabic(l.name);
    doc.font(nameAr ? "Arabic" : "Serif").fontSize(10);
    const nameH = doc.heightOfString(l.name, { width: wName - 4 });
    const rowH = Math.max(nameH, 12) + padV * 2;
    if (y + rowH > doc.page.height - BOTTOM_MARGIN) { doc.addPage(); y = header(BAND_HEIGHT + 40); }
    if (idx % 2 === 0) doc.rect(x0, y, contentWidth, rowH).fill(PANEL);
    const cy = y + padV;
    doc.font("Sans").fontSize(9).fillColor(MUTED).text(String(idx), xNum + 4, cy + 1, { width: wNum - 4, features: NO_LIGATURES });
    doc.font("Sans").fontSize(8.5).fillColor(INK).text(l.code, xCode + 2, cy + 1, { width: wCode - 4, features: NO_LIGATURES });
    doc.font(nameAr ? "Arabic" : "Serif").fontSize(10).fillColor(INK).text(l.name, xName + 2, cy, { width: wName - 4, align: nameAr ? "right" : "left", ...(nameAr ? {} : { features: NO_LIGATURES }) });
    doc.font("Sans-Bold").fontSize(10).fillColor(INK).text(money(l.qty), xQty, cy, { width: wQty - 6, align: "right", features: NO_LIGATURES });
    y += rowH;
    doc.moveTo(x0, y).lineTo(contentRight, y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
    idx++;
  }

  // --- Total units ------------------------------------------------------------
  y += 10;
  const boxW = wQty + 90, boxX = contentRight - boxW;
  doc.rect(boxX, y, boxW, 28).fill(INK);
  doc.font("Sans-Bold").fontSize(9.5).fillColor("#FFFDF9").text("TOTAL UNITS", boxX + 12, y + 9, { width: 100, characterSpacing: 1, features: NO_LIGATURES });
  doc.font("Sans-Bold").fontSize(12).fillColor("#FFFDF9").text(money(totalQty), boxX, y + 8, { width: boxW - 12, align: "right", features: NO_LIGATURES });
  y += 28 + 22;

  if (input.notes && input.notes.trim()) {
    doc.font("Sans-Bold").fontSize(9).fillColor(MUTED).text("NOTES", x0, y, { characterSpacing: 1.2, features: NO_LIGATURES });
    y = doc.y + 4;
    doc.font("Serif").fontSize(10).fillColor(INK).text(input.notes.trim(), x0, y, { width: contentWidth, lineGap: 3, features: NO_LIGATURES });
    y = doc.y + 18;
  }

  // --- Signatures -------------------------------------------------------------
  if (y + 70 > doc.page.height - BOTTOM_MARGIN) { doc.addPage(); y = BAND_HEIGHT + 40; }
  const half = (contentWidth - 40) / 2;
  for (const [label, xoff] of [["Dispatched by", 0], ["Received by (warehouse)", half + 40]] as [string, number][]) {
    doc.moveTo(x0 + xoff, y + 26).lineTo(x0 + xoff + half, y + 26).lineWidth(0.5).strokeColor(MUTED).stroke();
    doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(`${label} — name, signature & date`, x0 + xoff, y + 31, { width: half, characterSpacing: 0.5, features: NO_LIGATURES });
  }

  doc.end();
  return done;
}
