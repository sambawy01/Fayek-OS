import { db } from "./db";

export type BatchStatus =
  | "dispatched"
  | "received"
  | "pending_approval"
  | "resolved"
  | "rejected";

export interface BatchLine {
  id: number;
  slug: string;
  name: string;
  expectedQty: number;
  receivedQty: number | null;
}

export interface Batch {
  id: number;
  reference: string;
  supplier: string;
  status: BatchStatus;
  notes: string;
  createdBy: number | null;
  receivedBy: number | null;
  dispatchedAt: string;
  receivedAt: string | null;
  createdAt: string;
}

export interface BatchDetail extends Batch {
  lines: BatchLine[];
}

interface BatchRow {
  id: number; reference: string; supplier: string; status: string; notes: string;
  created_by: number | null; received_by: number | null; dispatched_at: string;
  received_at: string | null; created_at: string;
}
interface LineRow {
  id: number; slug: string; name: string; expected_qty: number; received_qty: number | null;
}

function toBatch(r: BatchRow): Batch {
  return {
    id: Number(r.id), reference: r.reference, supplier: r.supplier,
    status: r.status as BatchStatus, notes: r.notes,
    createdBy: r.created_by === null ? null : Number(r.created_by),
    receivedBy: r.received_by === null ? null : Number(r.received_by),
    dispatchedAt: r.dispatched_at, receivedAt: r.received_at, createdAt: r.created_at,
  };
}
function toLine(r: LineRow): BatchLine {
  return {
    id: Number(r.id), slug: r.slug, name: r.name,
    expectedQty: Number(r.expected_qty),
    receivedQty: r.received_qty === null ? null : Number(r.received_qty),
  };
}

export async function createBatch(
  input: {
    reference: string;
    supplier: string;
    notes: string;
    lines: { slug: string; name: string; expectedQty: number }[];
  },
  createdBy: number | null
): Promise<BatchDetail> {
  const rows = (await db()`
    INSERT INTO batches (reference, supplier, notes, created_by)
    VALUES (${input.reference}, ${input.supplier}, ${input.notes}, ${createdBy})
    RETURNING *
  `) as BatchRow[];
  const batch = toBatch(rows[0]);
  for (const l of input.lines) {
    await db()`
      INSERT INTO batch_lines (batch_id, slug, name, expected_qty)
      VALUES (${batch.id}, ${l.slug}, ${l.name}, ${l.expectedQty})
    `;
  }
  return (await getBatch(batch.id))!;
}

export async function listBatches(): Promise<Batch[]> {
  const rows = (await db()`
    SELECT * FROM batches ORDER BY created_at DESC LIMIT 100
  `) as BatchRow[];
  return rows.map(toBatch);
}

export async function getBatch(id: number): Promise<BatchDetail | null> {
  const rows = (await db()`SELECT * FROM batches WHERE id = ${id} LIMIT 1`) as BatchRow[];
  if (!rows[0]) return null;
  const lineRows = (await db()`
    SELECT * FROM batch_lines WHERE batch_id = ${id} ORDER BY id
  `) as LineRow[];
  return { ...toBatch(rows[0]), lines: lineRows.map(toLine) };
}

/**
 * Record received quantities per line and set the batch status. Returns the
 * refreshed detail. The route decides `status` (received vs pending_approval)
 * and owns the stock/approval side effects.
 */
export async function recordReceipt(
  batchId: number,
  receivedBy: number | null,
  received: { lineId: number; receivedQty: number }[],
  status: BatchStatus
): Promise<BatchDetail | null> {
  for (const r of received) {
    await db()`
      UPDATE batch_lines SET received_qty = ${r.receivedQty}
      WHERE id = ${r.lineId} AND batch_id = ${batchId}
    `;
  }
  await db()`
    UPDATE batches
       SET status = ${status}, received_by = ${receivedBy},
           received_at = now(), updated_at = now()
     WHERE id = ${batchId}
  `;
  return getBatch(batchId);
}

export async function setBatchStatus(
  batchId: number,
  status: BatchStatus
): Promise<void> {
  await db()`
    UPDATE batches SET status = ${status}, updated_at = now() WHERE id = ${batchId}
  `;
}
