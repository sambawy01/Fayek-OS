import {
  createBrandedDoc, INK, MUTED, HAIRLINE, ACCENT, PANEL, PAGE_MARGIN,
  BAND_HEIGHT, BOTTOM_MARGIN, NO_LIGATURES, hasArabic, money, fmtDateTime,
} from "./pdf-brand";
import type { Product } from "./catalog";

/**
 * Inventory list / stock report for audits and record-keeping. A point-in-time
 * snapshot of on-hand quantities (and stock value, for price-authorised roles),
 * as a branded PDF (printable, with a counted-by/verified-by signature block)
 * or a CSV (for spreadsheets). Reuses the shared branded chrome in pdf-brand.
 */

export type InventoryFilter = "all" | "tracked" | "low" | "out";
const LOW_THRESHOLD = 10;

export interface InventoryRow {
  code: string;
  name: string;
  quantity: number | null;
  priceEgp: number;
  status: string;
  valueEgp: number;
  updatedAt: string;
}

const FILTER_LABEL: Record<InventoryFilter, string> = {
  all: "All products",
  tracked: "Tracked stock only",
  low: `Low stock (≤ ${LOW_THRESHOLD})`,
  out: "Out of stock",
};

function statusOf(p: Product): string {
  if (!p.active) return "hidden";
  if (p.quantity === null) return "not tracked";
  if (p.soldOut || p.quantity === 0) return "out of stock";
  if (p.quantity <= LOW_THRESHOLD) return "low";
  return "in stock";
}

/** Project + filter the catalog into audit rows. */
export function inventoryRows(products: Product[], filter: InventoryFilter): InventoryRow[] {
  return products
    .filter((p) => {
      if (filter === "tracked") return p.quantity !== null;
      if (filter === "low") return p.quantity !== null && p.quantity <= LOW_THRESHOLD;
      if (filter === "out") return p.soldOut || p.quantity === 0;
      return true;
    })
    .map((p) => ({
      code: p.slug,
      name: p.en.name || p.slug,
      quantity: p.quantity,
      priceEgp: p.priceEgp,
      status: statusOf(p),
      valueEgp: p.quantity !== null ? p.quantity * p.priceEgp : 0,
      updatedAt: (p.updatedAt || "").slice(0, 10),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export interface InventoryReportOpts {
  filter: InventoryFilter;
  generatedBy: string;
  withValue: boolean;
  now?: Date;
}

function totals(rows: InventoryRow[]) {
  const units = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const value = rows.reduce((s, r) => s + r.valueEgp, 0);
  return { skus: rows.length, units, value };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV for spreadsheets / audit import. */
export function inventoryCsv(products: Product[], opts: InventoryReportOpts): string {
  const rows = inventoryRows(products, opts.filter);
  const t = totals(rows);
  const head = ["Code", "Product", "On-hand", "Status", ...(opts.withValue ? ["Unit Price (EGP)", "Stock Value (EGP)"] : []), "Last Updated"];
  const lines = [
    `# Fayek Abrasives — Inventory Report`,
    `# Generated,${csvCell(fmtDateTime(opts.now ?? new Date()))}`,
    `# By,${csvCell(opts.generatedBy)}`,
    `# Filter,${csvCell(FILTER_LABEL[opts.filter])}`,
    `# SKUs,${t.skus},Units,${t.units}${opts.withValue ? `,Total Value (EGP),${t.value}` : ""}`,
    "",
    head.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.code, r.name, r.quantity ?? "", r.status,
        ...(opts.withValue ? [r.priceEgp, r.valueEgp] : []),
        r.updatedAt,
      ].map(csvCell).join(",")
    ),
  ];
  return lines.join("\n");
}

/** Branded PDF stock list with a signature block for audits. */
export async function renderInventoryPdf(products: Product[], opts: InventoryReportOpts): Promise<Buffer> {
  const rows = inventoryRows(products, opts.filter);
  const t = totals(rows);
  const now = opts.now ?? new Date();
  const { doc, done, x0, contentWidth, contentRight } = await createBrandedDoc({ title: "Inventory Report" });

  // --- Title + meta -----------------------------------------------------------
  let y = BAND_HEIGHT + 40;
  doc.font("Sans-Bold").fontSize(22).fillColor(INK)
    .text("INVENTORY REPORT", x0, y, { characterSpacing: 1.5, features: NO_LIGATURES });
  const meta: [string, string][] = [
    ["Generated", fmtDateTime(now)],
    ["Prepared by", opts.generatedBy || "—"],
    ["Scope", FILTER_LABEL[opts.filter]],
  ];
  let my = y + 2;
  for (const [k, v] of meta) {
    doc.font("Sans").fontSize(8.5).fillColor(MUTED)
      .text(k.toUpperCase(), contentRight - 300, my, { width: 130, align: "right", characterSpacing: 0.8, features: NO_LIGATURES });
    doc.font("Sans-Bold").fontSize(9.5).fillColor(INK)
      .text(v, contentRight - 165, my - 1, { width: 165, align: "right", features: NO_LIGATURES });
    my += 15;
  }
  y = Math.max(y + 38, my + 6);

  // --- Summary strip ----------------------------------------------------------
  doc.roundedRect(x0, y, contentWidth, 40, 6).fill(PANEL);
  const cells: [string, string][] = [
    ["SKUs", String(t.skus)],
    ["Total units", t.units.toLocaleString("en-EG")],
    ...(opts.withValue ? [["Stock value", `${money(t.value)} EGP`] as [string, string]] : []),
  ];
  const cw = contentWidth / cells.length;
  cells.forEach(([k, v], i) => {
    doc.font("Sans").fontSize(8).fillColor(MUTED).text(k.toUpperCase(), x0 + i * cw + 14, y + 9, { characterSpacing: 1, features: NO_LIGATURES });
    doc.font("Sans-Bold").fontSize(13).fillColor(INK).text(v, x0 + i * cw + 14, y + 20, { features: NO_LIGATURES });
  });
  y += 40 + 18;

  // --- Table ------------------------------------------------------------------
  const wNum = 22, wQty = 56, wStatus = 66;
  const wUnit = opts.withValue ? 62 : 0, wValue = opts.withValue ? 78 : 0;
  const wCode = 108;
  const wName = contentWidth - wNum - wCode - wQty - wStatus - wUnit - wValue;
  const xNum = x0, xCode = xNum + wNum, xName = xCode + wCode, xQty = xName + wName;
  const xStatus = xQty + wQty, xUnit = xStatus + wStatus, xValue = xUnit + wUnit;
  const padV = 6;

  const header = (hy: number): number => {
    doc.rect(x0, hy, contentWidth, 22).fill(ACCENT);
    doc.font("Sans-Bold").fontSize(8).fillColor("#FFFDF9");
    const ty = hy + 7;
    doc.text("#", xNum + 3, ty, { width: wNum - 3, features: NO_LIGATURES });
    doc.text("CODE", xCode + 2, ty, { width: wCode - 4, features: NO_LIGATURES });
    doc.text("PRODUCT", xName + 2, ty, { width: wName - 4, features: NO_LIGATURES });
    doc.text("ON-HAND", xQty, ty, { width: wQty - 6, align: "right", features: NO_LIGATURES });
    doc.text("STATUS", xStatus + 4, ty, { width: wStatus - 6, features: NO_LIGATURES });
    if (opts.withValue) {
      doc.text("UNIT EGP", xUnit, ty, { width: wUnit - 4, align: "right", features: NO_LIGATURES });
      doc.text("VALUE EGP", xValue, ty, { width: wValue - 4, align: "right", features: NO_LIGATURES });
    }
    return hy + 22;
  };

  y = header(y);
  let idx = 1;
  for (const r of rows) {
    const nameAr = hasArabic(r.name);
    doc.font(nameAr ? "Arabic" : "Serif").fontSize(9);
    const nameH = doc.heightOfString(r.name, { width: wName - 4 });
    const rowH = Math.max(nameH, 11) + padV * 2;
    if (y + rowH > doc.page.height - BOTTOM_MARGIN) { doc.addPage(); y = header(BAND_HEIGHT + 40); }
    if (idx % 2 === 0) doc.rect(x0, y, contentWidth, rowH).fill(PANEL);
    const cy = y + padV;
    doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(String(idx), xNum + 3, cy + 1, { width: wNum - 3, features: NO_LIGATURES });
    doc.font("Sans").fontSize(8).fillColor(INK).text(r.code, xCode + 2, cy + 1, { width: wCode - 4, features: NO_LIGATURES });
    doc.font(nameAr ? "Arabic" : "Serif").fontSize(9).fillColor(INK).text(r.name, xName + 2, cy, { width: wName - 4, align: nameAr ? "right" : "left", ...(nameAr ? {} : { features: NO_LIGATURES }) });
    doc.font("Sans-Bold").fontSize(9).fillColor(INK).text(r.quantity === null ? "—" : String(r.quantity), xQty, cy, { width: wQty - 6, align: "right", features: NO_LIGATURES });
    const stCol = r.status === "out of stock" ? "#B5483A" : r.status === "low" ? "#8A6418" : MUTED;
    doc.font("Sans").fontSize(8).fillColor(stCol).text(r.status, xStatus + 4, cy + 1, { width: wStatus - 6, features: NO_LIGATURES });
    if (opts.withValue) {
      doc.font("Sans").fontSize(8.5).fillColor(INK).text(money(r.priceEgp), xUnit, cy, { width: wUnit - 4, align: "right", features: NO_LIGATURES });
      doc.font("Sans-Bold").fontSize(8.5).fillColor(INK).text(r.quantity === null ? "—" : money(r.valueEgp), xValue, cy, { width: wValue - 4, align: "right", features: NO_LIGATURES });
    }
    y += rowH;
    doc.moveTo(x0, y).lineTo(contentRight, y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
    idx++;
  }
  if (rows.length === 0) {
    doc.font("Serif").fontSize(10).fillColor(MUTED).text("No products match this scope.", x0, y + 10, { width: contentWidth, align: "center", features: NO_LIGATURES });
    y += 30;
  }

  // --- Audit signature block --------------------------------------------------
  y += 22;
  if (y + 70 > doc.page.height - BOTTOM_MARGIN) { doc.addPage(); y = BAND_HEIGHT + 40; }
  const half = (contentWidth - 40) / 2;
  for (const [label, xoff] of [["Counted by", 0], ["Verified by", half + 40]] as [string, number][]) {
    doc.moveTo(x0 + xoff, y + 26).lineTo(x0 + xoff + half, y + 26).lineWidth(0.5).strokeColor(MUTED).stroke();
    doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(`${label} — name & signature`, x0 + xoff, y + 31, { width: half, characterSpacing: 0.5, features: NO_LIGATURES });
    doc.font("Sans").fontSize(8).fillColor(HAIRLINE);
  }
  doc.font("Sans").fontSize(8).fillColor(MUTED).text(`Date: __________________`, x0, y + 52, { features: NO_LIGATURES });

  doc.end();
  return done;
}
