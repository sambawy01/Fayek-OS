import { listOrders, type StoredOrder } from "./orders";

/**
 * Shared data gathering for the owner's daily brief — used by both the
 * morning cron email (/api/cron/daily-brief) and the assistant's `daily_brief`
 * Telegram tool, so the two views can never drift.
 *
 * Fail-soft per source: if Blob is down, the brief still renders with a
 * "couldn't load X" note instead of failing entirely.
 */

export interface DailyBriefData {
  orders: StoredOrder[];
  failures: string[];
}

export async function gatherDailyBriefData(): Promise<DailyBriefData> {
  const failures: string[] = [];

  let orders: StoredOrder[] = [];
  try {
    orders = await listOrders();
  } catch (error) {
    console.error("[daily-brief] Failed to load shop orders:", error);
    failures.push("shop orders");
  }

  return { orders, failures };
}
