"use client";

export interface Inst { amount: string; due: string }

const cell = "rounded-xl border border-[#38492E]/15 bg-white px-2.5 py-1.5 text-sm text-[#38492E] outline-none focus:border-[#357F75]";
const subtleBtn = "rounded-full border border-[#38492E]/15 bg-[#FBF4E6] px-3 py-1.5 text-sm text-[#38492E] transition hover:bg-[#EFE7D6]";

/**
 * Custom installment schedule: add any number of installments, each with its
 * own amount + due date, or auto "split into N equal" over the remaining
 * balance. `remaining` = total − advance, used only by the split helper.
 */
export default function InstallmentBuilder({
  value, onChange, remaining,
}: {
  value: Inst[];
  onChange: (v: Inst[]) => void;
  remaining: number;
}) {
  const scheduled = value.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  function splitN() {
    const raw = window.prompt("Split the remaining balance into how many equal installments?");
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) return;
    const base = Math.floor(Math.max(0, remaining) / n);
    const rows: Inst[] = [];
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? Math.max(0, remaining) - base * (n - 1) : base;
      const d = new Date();
      d.setMonth(d.getMonth() + i + 1);
      rows.push({ amount: String(amt), due: d.toISOString().slice(0, 10) });
    }
    onChange(rows);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-[0.08em] text-[#5E6B4F]">Installments</label>
        <div className="flex gap-2">
          <button type="button" className={subtleBtn} onClick={() => onChange([...value, { amount: "", due: "" }])}>+ Add</button>
          <button type="button" className={subtleBtn} onClick={splitN}>Split into N…</button>
        </div>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-[#5E6B4F]">None — the full balance is due by the due date, or add installments.</p>
      ) : (
        <div className="space-y-2">
          {value.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-xs text-[#5E6B4F]">#{i + 1}</span>
              <input className={`${cell} w-28`} inputMode="numeric" placeholder="Amount EGP" value={r.amount}
                onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
              <input className={cell} type="date" value={r.due}
                onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, due: e.target.value } : x))} />
              <button type="button" className={subtleBtn} onClick={() => onChange(value.filter((_, j) => j !== i))}>–</button>
            </div>
          ))}
          <p className="text-xs text-[#5E6B4F]">
            Scheduled: {scheduled.toLocaleString("en-EG")} EGP
            {remaining > 0 && scheduled !== remaining && (
              <span className="text-[#B5483A]"> · balance is {remaining.toLocaleString("en-EG")} EGP</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
