import { db } from "./db";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: number;
  type: string;
  status: ApprovalStatus;
  refBatchId: number | null;
  title: string;
  detail: unknown;
  aiRecommendation: string;
  raisedBy: number | null;
  decidedBy: number | null;
  decisionNote: string;
  createdAt: string;
  decidedAt: string | null;
}

interface Row {
  id: number; type: string; status: string; ref_batch_id: number | null;
  title: string; detail: unknown; ai_recommendation: string;
  raised_by: number | null; decided_by: number | null; decision_note: string;
  created_at: string; decided_at: string | null;
}

function toApproval(r: Row): Approval {
  return {
    id: Number(r.id), type: r.type, status: r.status as ApprovalStatus,
    refBatchId: r.ref_batch_id === null ? null : Number(r.ref_batch_id),
    title: r.title, detail: r.detail, aiRecommendation: r.ai_recommendation,
    raisedBy: r.raised_by === null ? null : Number(r.raised_by),
    decidedBy: r.decided_by === null ? null : Number(r.decided_by),
    decisionNote: r.decision_note, createdAt: r.created_at, decidedAt: r.decided_at,
  };
}

export async function createApproval(input: {
  type: string;
  refBatchId: number | null;
  title: string;
  detail: unknown;
  raisedBy: number | null;
}): Promise<Approval> {
  const rows = (await db()`
    INSERT INTO approvals (type, ref_batch_id, title, detail, raised_by)
    VALUES (${input.type}, ${input.refBatchId}, ${input.title},
            ${JSON.stringify(input.detail)}::jsonb, ${input.raisedBy})
    RETURNING *
  `) as Row[];
  return toApproval(rows[0]);
}

export async function listApprovals(
  status?: ApprovalStatus
): Promise<Approval[]> {
  const rows = status
    ? ((await db()`
        SELECT * FROM approvals WHERE status = ${status}
        ORDER BY created_at DESC LIMIT 100
      `) as Row[])
    : ((await db()`
        SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100
      `) as Row[]);
  return rows.map(toApproval);
}

export async function countPendingApprovals(): Promise<number> {
  const rows = (await db()`
    SELECT count(*)::int AS n FROM approvals WHERE status = 'pending'
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function getApproval(id: number): Promise<Approval | null> {
  const rows = (await db()`SELECT * FROM approvals WHERE id = ${id} LIMIT 1`) as Row[];
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function decideApproval(
  id: number,
  decidedBy: number | null,
  status: Exclude<ApprovalStatus, "pending">,
  note: string
): Promise<Approval | null> {
  const rows = (await db()`
    UPDATE approvals
       SET status = ${status}, decided_by = ${decidedBy},
           decision_note = ${note}, decided_at = now()
     WHERE id = ${id} AND status = 'pending'
    RETURNING *
  `) as Row[];
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function setApprovalRecommendation(
  id: number,
  text: string
): Promise<void> {
  await db()`UPDATE approvals SET ai_recommendation = ${text} WHERE id = ${id}`;
}
