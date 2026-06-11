import { useState } from "react";
import { createDeal } from "../../api/deals";
import type { Deal, NewDealInput } from "../../types/deal";

interface NewDealFormProps {
  onCreated: (deal: Deal) => void;
}

const SECTORS = ["Healthcare", "Climate", "FinTech"] as const;
const STAGES = ["Seed", "Series A", "Series B", "Series C", "Growth"] as const;
const STATUSES = ["new", "screening", "due_diligence", "ic_review"] as const;

const fieldClass =
  "w-full px-3 py-2 border border-[var(--border-color)] rounded-lg text-sm bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50";
const labelClass = "text-xs font-medium text-[var(--text-secondary)] mb-1 block";

export function NewDealForm({ onCreated }: NewDealFormProps) {
  const [form, setForm] = useState({
    company_name: "",
    sector: SECTORS[0] as string,
    stage: STAGES[1] as string,
    status: STATUSES[0] as string,
    ask_amount: "",
    valuation: "",
    source: "",
    lead_partner: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const ask = Number(form.ask_amount);
    const val = Number(form.valuation);
    if (!form.company_name.trim()) return setError("Company name is required");
    if (!Number.isFinite(ask) || ask <= 0) return setError("Ask amount must be a positive number");
    if (!Number.isFinite(val) || val <= 0) return setError("Valuation must be a positive number");

    const payload: NewDealInput = {
      company_name: form.company_name.trim(),
      sector: form.sector,
      stage: form.stage,
      status: form.status,
      ask_amount: Math.round(ask),
      valuation: Math.round(val),
      source: form.source.trim() || null,
      lead_partner: form.lead_partner.trim() || null,
    };

    setSubmitting(true);
    const result = await createDeal(payload);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.deal);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Company name *</label>
        <input className={fieldClass} value={form.company_name} onChange={update("company_name")} disabled={submitting} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Sector *</label>
          <select className={fieldClass} value={form.sector} onChange={update("sector")} disabled={submitting}>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Stage *</label>
          <select className={fieldClass} value={form.stage} onChange={update("stage")} disabled={submitting}>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Status *</label>
          <select className={fieldClass} value={form.status} onChange={update("status")} disabled={submitting}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Ask amount (USD) *</label>
          <input className={fieldClass} type="number" min={0} value={form.ask_amount} onChange={update("ask_amount")} disabled={submitting} placeholder="e.g. 10000000" />
        </div>
        <div>
          <label className={labelClass}>Valuation (USD) *</label>
          <input className={fieldClass} type="number" min={0} value={form.valuation} onChange={update("valuation")} disabled={submitting} placeholder="e.g. 50000000" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Source</label>
          <input className={fieldClass} value={form.source} onChange={update("source")} disabled={submitting} placeholder="optional" />
        </div>
        <div>
          <label className={labelClass}>Lead partner</label>
          <input className={fieldClass} value={form.lead_partner} onChange={update("lead_partner")} disabled={submitting} placeholder="optional" />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Creating..." : "Create deal"}
      </button>
    </form>
  );
}
