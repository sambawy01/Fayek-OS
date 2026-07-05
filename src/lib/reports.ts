import { listOrders } from "./orders";
import { orderRevenueEgp } from "./reports/weekly-report";
import { getCatalog } from "./catalog";
import { listReceivables } from "./receivables";

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
  const orders = await listOrders({ limit: 500 });
  const cutoff = Date.now() - days * 86_400_000;
  const recent = orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
  const qtyByName = new Map<string, number>();
  for (const o of recent) {
    for (const it of o.items) {
      qtyByName.set(it.names.en, (qtyByName.get(it.names.en) ?? 0) + it.qty);
    }
  }
  const topProducts = [...qtyByName.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);
  return {
    periodDays: days,
    revenueEgp: orderRevenueEgp(recent),
    orderCount: recent.length,
    topProducts,
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
