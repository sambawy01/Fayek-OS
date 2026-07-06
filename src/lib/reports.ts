import { getCatalog } from "./catalog";
import { listReceivables } from "./receivables";
import { purchaseOrderSalesSummary } from "./sales";

const LOW_STOCK = 5;

export interface SalesReport {
  periodDays: number;
  revenueEgp: number;
  orderCount: number;
  topProducts: { name: string; qty: number }[];
}
export interface InventoryReport {
  totalSkus: number;
  trackedUnits: number;
  outOfStock: number;
  lowStock: { name: string; qty: number }[];
}
export interface ReceivablesReport {
  outstandingEgp: number;
  openCount: number;
  overdueCount: number;
  overdueEgp: number;
}

export async function buildSalesReport(days = 30): Promise<SalesReport> {
  // Sales = purchase orders (the order book). The storefront-orders source is retired.
  const s = await purchaseOrderSalesSummary(days);
  return {
    periodDays: days,
    revenueEgp: s.revenueEgp,
    orderCount: s.orderCount,
    topProducts: s.topProducts,
  };
}

export async function buildInventoryReport(): Promise<InventoryReport> {
  const catalog = await getCatalog();
  const active = catalog.filter((p) => p.active);
  const tracked = active.filter((p) => typeof p.quantity === "number");
  return {
    totalSkus: active.length,
    trackedUnits: tracked.reduce((s, p) => s + (p.quantity ?? 0), 0),
    outOfStock: tracked.filter((p) => p.quantity === 0).length,
    lowStock: tracked
      .filter((p) => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= LOW_STOCK)
      .map((p) => ({ name: p.en.name, qty: p.quantity ?? 0 }))
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 20),
  };
}

export async function buildReceivablesReport(): Promise<ReceivablesReport> {
  const open = await listReceivables(true);
  const today = new Date(new Date().toDateString());
  const overdue = open.filter((r) => r.dueDate && new Date(r.dueDate) < today);
  return {
    outstandingEgp: open.reduce((s, r) => s + r.balanceEgp, 0),
    openCount: open.length,
    overdueCount: overdue.length,
    overdueEgp: overdue.reduce((s, r) => s + r.balanceEgp, 0),
  };
}
