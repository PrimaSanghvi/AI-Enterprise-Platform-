import { useState } from "react";
import { uploadDeal } from "../../api/deals";
import type { Deal } from "../../types/deal";

interface NewDealUploadProps {
  onCreated: (deal: Deal, warnings: string[]) => void;
}

export function NewDealUpload({ onCreated }: NewDealUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f: File | null) => {
    setError(null);
    setFile(f);
    setPreview("");
    if (!f) return;
    try {
      const text = await f.text();
      setPreview(text.slice(0, 1200));
    } catch (e) {
      setError(`Could not read file: ${(e as Error).message}`);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setError(null);
    setSubmitting(true);
    const result = await uploadDeal(file);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.deal, result.warnings || []);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">
          Upload .json or .csv (single deal)
        </label>
        <input
          type="file"
          accept=".csv,.json,application/json,text/csv"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
          className="block w-full text-sm text-[var(--text-primary)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Required keys/columns: company_name, sector, stage, status, ask_amount, valuation.
          CSV files with multiple rows will use the first row only.
        </p>
      </div>

      {preview && (
        <div>
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Preview</div>
          <pre className="bg-[var(--bg-card-alt)] border border-[var(--border-color)] rounded-md p-3 text-xs overflow-x-auto max-h-48 text-[var(--text-primary)]">
            {preview}
          </pre>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Uploading..." : "Confirm & Create"}
      </button>
    </div>
  );
}
