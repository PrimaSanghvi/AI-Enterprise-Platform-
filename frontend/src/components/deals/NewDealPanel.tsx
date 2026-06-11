import { useState } from "react";
import type { Deal } from "../../types/deal";
import { NewDealForm } from "./NewDealForm";
import { NewDealUpload } from "./NewDealUpload";
import { NewDealChat } from "./NewDealChat";

interface NewDealPanelProps {
  onClose: () => void;
  onTriage: (dealId: string) => void;
}

type Mode = "manual" | "chat" | "upload";

const TABS: { id: Mode; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "chat", label: "AI Chat" },
  { id: "upload", label: "Upload" },
];

export function NewDealPanel({ onClose, onTriage }: NewDealPanelProps) {
  const [mode, setMode] = useState<Mode>("manual");
  const [createdDeal, setCreatedDeal] = useState<Deal | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleCreated = (deal: Deal, warns: string[] = []) => {
    setCreatedDeal(deal);
    setWarnings(warns);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {createdDeal ? `Deal created: ${createdDeal.deal_id}` : "Add a new deal"}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-gray-600 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!createdDeal && (
          <div className="px-6 pt-4 border-b border-[var(--border-color)]">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMode(t.id)}
                  className={
                    "px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors " +
                    (mode === t.id
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]")
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-6 py-5 overflow-y-auto">
          {!createdDeal && mode === "manual" && <NewDealForm onCreated={(d) => handleCreated(d)} />}
          {!createdDeal && mode === "upload" && <NewDealUpload onCreated={(d, w) => handleCreated(d, w)} />}
          {!createdDeal && mode === "chat" && <NewDealChat onCreated={(d) => handleCreated(d)} />}

          {createdDeal && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-card-alt)] border border-[var(--border-color)] rounded-md p-4 text-sm space-y-1.5">
                <Row label="Deal ID" value={createdDeal.deal_id} />
                <Row label="Company" value={`${createdDeal.company_name} (${createdDeal.company_id})`} />
                <Row label="Sector / Stage" value={`${createdDeal.sector} · ${createdDeal.stage}`} />
                <Row label="Status" value={createdDeal.status} />
                <Row label="Ask / Valuation" value={`$${createdDeal.ask_amount.toLocaleString()} / $${createdDeal.valuation.toLocaleString()}`} />
              </div>

              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
                  {warnings.map((w, i) => <div key={i}>• {w}</div>)}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800">
                No documents indexed for this company yet — triage will proceed without document retrieval.
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onTriage(createdDeal.deal_id)}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Run Triage now
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-card-alt)] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <div className="w-40 text-[var(--text-secondary)]">{label}</div>
      <div className="flex-1 text-[var(--text-primary)] font-medium">{value}</div>
    </div>
  );
}
