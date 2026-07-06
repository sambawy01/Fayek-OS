import { db } from "./db";
import { dateOnly, isoString } from "./db-dates";

export type ReceivableStatus = "pending" | "partial" | "paid" | "void";

export interface Payment {
  id: number;
  amountEgp: number;
  method: string;
  kind: string;
  note: string;
  paidAt: string;
  /** Proof-of-payment document (bank receipt / cheque image or PDF) URL. */
  proofUrl: string;
}
export interface Installment {
  id: number;
  seq: number;
  dueDate: string | null;
  amountEgp: number;
}

export interface Receivable {
  id: number;
  companyId: number | null;
  companyName: string;
  orderRef: string;
  totalEgp: number;
  paidEgp: number;
  balanceEgp: number;
  status: ReceivableStatus;
  dueDate: string | null;
  notes: string;
  createdAt: string;
}
export interface ReceivableDetail extends Receivable {
  payments: Payment[];
  installments: Installment[];
}

interface RRow {
  id: number; company_id: number | null; company_name: string; order_ref: string;
  total_egp: number; status: string; due_date: string | null; notes: string; created_at: string;
  paid_egp?: number;
}
function toReceivable(r: RRow, paid: number): Receivable {
  const total = Number(r.total_egp);
  return {
    id: Number(r.id), companyId: r.company_id === null ? null : Number(r.company_id),
    companyName: r.company_name, orderRef: r.order_ref, totalEgp: total,
    paidEgp: paid, balanceEgp: Math.max(0, total - paid),
    status: r.status as ReceivableStatus, dueDate: dateOnly(r.due_date), notes: r.notes,
    createdAt: isoString(r.created_at),
  };
}

function statusFor(total: number, paid: number): ReceivableStatus {
  if (paid <= 0) return "pending";
  if (paid >= total) return "paid";
  return "partial";
}

export async function createReceivable(
  input: {
    companyId: number | null;
    companyName: string;
    orderRef?: string;
    totalEgp: number;
    dueDate?: string | null;
    notes?: string;
    advance?: { amountEgp: number; method: string; proofUrl?: string };
    /** Explicit installment schedule (amount + optional due date each). */
    installments?: { amountEgp: number; dueDate?: string | null }[];
    /** Fallback: auto-split the remaining balance into N equal monthly steps. */
    installmentCount?: number;
    firstDueDate?: string | null;
  },
  createdBy: number | null
): Promise<ReceivableDetail> {
  const advAmt = input.advance && input.advance.amountEgp > 0 ? Math.round(input.advance.amountEgp) : 0;
  const advMethod = input.advance?.method ?? "bank_transfer";
  const advProof = input.advance?.proofUrl ?? "";
  const remaining = Math.max(0, input.totalEgp - advAmt);

  // Build the installment schedule up front (explicit wins; else auto-split),
  // as parallel arrays so the whole receivable — header + advance payment +
  // installments — inserts ATOMICALLY in one data-modifying CTE.
  const seqs: number[] = [], dues: (string | null)[] = [], amts: number[] = [];
  if (input.installments && input.installments.length > 0) {
    let seq = 1;
    for (const it of input.installments) {
      if (!(it.amountEgp > 0)) continue;
      seqs.push(seq); dues.push(it.dueDate ?? null); amts.push(Math.round(it.amountEgp)); seq++;
    }
  } else {
    const n = input.installmentCount ?? 0;
    if (n > 0 && remaining > 0) {
      const base = Math.floor(remaining / n);
      const first = new Date(input.firstDueDate ?? Date.now());
      for (let i = 0; i < n; i++) {
        const amt = i === n - 1 ? remaining - base * (n - 1) : base; // last picks up rounding
        const due = new Date(first);
        due.setMonth(due.getMonth() + i);
        seqs.push(i + 1); dues.push(due.toISOString().slice(0, 10)); amts.push(amt);
      }
    }
  }

  const rows = (await db()`
    WITH r AS (
      INSERT INTO receivables (company_id, company_name, order_ref, total_egp, due_date, notes, created_by)
      VALUES (${input.companyId}, ${input.companyName}, ${input.orderRef ?? ""},
              ${input.totalEgp}, ${input.dueDate ?? null}, ${input.notes ?? ""}, ${createdBy})
      RETURNING id
    ),
    adv AS (
      INSERT INTO receivable_payments (receivable_id, amount_egp, method, kind, proof_url, recorded_by)
      SELECT r.id, ${advAmt}, ${advMethod}, 'advance', ${advProof}, ${createdBy} FROM r WHERE ${advAmt} > 0
      RETURNING 1
    ),
    ins AS (
      INSERT INTO installments (receivable_id, seq, due_date, amount_egp)
      SELECT r.id, t.seq, t.due, t.amt
      FROM r, unnest(${seqs}::int[], ${dues}::date[], ${amts}::int[]) AS t(seq, due, amt)
      RETURNING 1
    )
    SELECT id FROM r
  `) as { id: number }[];
  const id = Number(rows[0].id);

  await refreshStatus(id);
  return (await getReceivable(id))!;
}

async function paidSum(id: number): Promise<number> {
  const rows = (await db()`
    SELECT COALESCE(SUM(amount_egp),0)::int AS paid FROM receivable_payments WHERE receivable_id = ${id}
  `) as { paid: number }[];
  return rows[0]?.paid ?? 0;
}

async function refreshStatus(id: number): Promise<void> {
  const rows = (await db()`SELECT total_egp, status FROM receivables WHERE id = ${id}`) as RRow[];
  if (!rows[0]) return;
  if (rows[0].status === "void") return;
  const paid = await paidSum(id);
  await db()`
    UPDATE receivables SET status = ${statusFor(Number(rows[0].total_egp), paid)}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function listReceivables(open = false): Promise<Receivable[]> {
  const rows = open
    ? ((await db()`
        SELECT r.*, COALESCE(p.paid,0) AS paid_egp FROM receivables r
        LEFT JOIN (SELECT receivable_id, SUM(amount_egp)::int paid FROM receivable_payments GROUP BY receivable_id) p
          ON p.receivable_id = r.id
        WHERE r.status IN ('pending','partial')
        ORDER BY r.due_date NULLS LAST, r.created_at DESC LIMIT 200
      `) as RRow[])
    : ((await db()`
        SELECT r.*, COALESCE(p.paid,0) AS paid_egp FROM receivables r
        LEFT JOIN (SELECT receivable_id, SUM(amount_egp)::int paid FROM receivable_payments GROUP BY receivable_id) p
          ON p.receivable_id = r.id
        ORDER BY r.created_at DESC LIMIT 200
      `) as RRow[]);
  return rows.map((r) => toReceivable(r, Number(r.paid_egp ?? 0)));
}

export async function getReceivable(id: number): Promise<ReceivableDetail | null> {
  const rows = (await db()`SELECT * FROM receivables WHERE id = ${id}`) as RRow[];
  if (!rows[0]) return null;
  const paid = await paidSum(id);
  const payRows = (await db()`
    SELECT * FROM receivable_payments WHERE receivable_id = ${id} ORDER BY paid_at
  `) as { id: number; amount_egp: number; method: string; kind: string; note: string; paid_at: string; proof_url?: string }[];
  const instRows = (await db()`
    SELECT * FROM installments WHERE receivable_id = ${id} ORDER BY seq
  `) as { id: number; seq: number; due_date: string | null; amount_egp: number }[];
  return {
    ...toReceivable(rows[0], paid),
    payments: payRows.map((p) => ({
      id: Number(p.id), amountEgp: Number(p.amount_egp), method: p.method, kind: p.kind, note: p.note, paidAt: isoString(p.paid_at), proofUrl: p.proof_url ?? "",
    })),
    installments: instRows.map((i) => ({
      id: Number(i.id), seq: Number(i.seq), dueDate: dateOnly(i.due_date), amountEgp: Number(i.amount_egp),
    })),
  };
}

export async function recordPayment(
  id: number,
  input: { amountEgp: number; method: string; note?: string; kind?: string; proofUrl?: string },
  recordedBy: number | null
): Promise<ReceivableDetail | null> {
  const exists = (await db()`SELECT id FROM receivables WHERE id = ${id}`) as { id: number }[];
  if (!exists[0]) return null;
  await db()`
    INSERT INTO receivable_payments (receivable_id, amount_egp, method, kind, note, proof_url, recorded_by)
    VALUES (${id}, ${Math.round(input.amountEgp)}, ${input.method}, ${input.kind ?? "installment"}, ${input.note ?? ""}, ${input.proofUrl ?? ""}, ${recordedBy})
  `;
  await refreshStatus(id);
  return getReceivable(id);
}

/** Total outstanding across open receivables (for reports/finance). */
export async function totalOutstanding(): Promise<number> {
  const rows = (await db()`
    SELECT COALESCE(SUM(r.total_egp),0)::int AS total,
           COALESCE(SUM(p.paid),0)::int AS paid
      FROM receivables r
      LEFT JOIN (SELECT receivable_id, SUM(amount_egp)::int paid FROM receivable_payments GROUP BY receivable_id) p
        ON p.receivable_id = r.id
     WHERE r.status IN ('pending','partial')
  `) as { total: number; paid: number }[];
  return Math.max(0, (rows[0]?.total ?? 0) - (rows[0]?.paid ?? 0));
}
