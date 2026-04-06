import type { Deal } from "../../types/deal";

interface DealTableProps {
  deals: Deal[];
  loading: boolean;
  error: string | null;
  triagingDealId: string | null;
  onRunTriage: (dealId: string) => void;
}

const statusColors: Record<string, string> = {
  screening: "bg-blue-100 text-blue-800",
  due_diligence: "bg-purple-100 text-purple-800",
  ic_review: "bg-orange-100 text-orange-800",
  closed: "bg-gray-100 text-gray-800",
};

const triageColors: Record<string, string> = {
  pending: "bg-gray-100 text-[var(--text-secondary)]",
  advance: "bg-green-100 text-green-800",
  pass: "bg-red-100 text-red-800",
  hold: "bg-yellow-100 text-yellow-800",
};

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
  return `$${(amount / 1_000).toFixed(0)}K`;
}

export function DealTable({
  deals,
  loading,
  error,
  triagingDealId,
  onRunTriage,
}: DealTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
        Loading deals...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-[var(--text-secondary)] uppercase bg-[var(--bg-card-alt)] border-b border-[var(--border-color)]">
          <tr>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Ask</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Triage</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-color)]">
          {deals.map((deal) => (
            <tr
              key={deal.deal_id}
              className="hover:bg-[var(--bg-card-alt)] transition-colors"
            >
              <td className="px-4 py-3">
                <div className="font-medium text-[var(--text-primary)]">
                  {deal.company_name}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{deal.deal_id}</div>
              </td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{deal.sector}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{deal.stage}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">
                {formatCurrency(deal.ask_amount)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    statusColors[deal.status] || "bg-gray-100 text-[var(--text-secondary)]"
                  }`}
                >
                  {deal.status.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    triageColors[deal.triage_status] ||
                    "bg-gray-100 text-[var(--text-secondary)]"
                  }`}
                >
                  {deal.triage_status}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onRunTriage(deal.deal_id)}
                  disabled={triagingDealId === deal.deal_id}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {triagingDealId === deal.deal_id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Running...
                    </span>
                  ) : (
                    "Run Triage"
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
