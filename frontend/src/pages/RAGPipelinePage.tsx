import { useState, useEffect } from "react";
import { useRAGStats } from "../hooks/useRAGStats";
import type { PipelineStage } from "../api/rag";

/* ── Step descriptions (static — enriches backend stage data) ── */
const stepDescriptions: Record<string, string> = {
  ingest: "Load documents from File Server",
  chunk: "Split into semantic chunks (500-1000 tokens)",
  embed: "Generate TF-IDF vector embeddings",
  index: "Upsert into in-memory vector store",
  retrieve: "Hybrid search (vector + keyword)",
  rerank: "Section boost + entity match scoring",
};

const statusColors: Record<string, string> = {
  done: "bg-green-500",
  ready: "bg-blue-500",
  idle: "bg-gray-400",
  processing: "bg-yellow-500 animate-pulse",
};

const statusLabels: Record<string, string> = {
  done: "Complete",
  ready: "Ready",
  idle: "Idle",
  processing: "Processing",
};

const sectorColors: Record<string, string> = {
  Healthcare: "bg-blue-100 text-blue-800",
  Climate: "bg-green-100 text-green-800",
  FinTech: "bg-purple-100 text-purple-800",
};

export default function RAGPipelinePage() {
  const { stats, loading, error } = useRAGStats(10000);
  const [activeStep, setActiveStep] = useState<string | null>(null);

  // Animate pipeline steps on first load
  useEffect(() => {
    if (!stats) return;
    const steps = stats.pipeline_stages.map((s) => s.id);
    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setActiveStep(steps[i]);
        i++;
      } else {
        setActiveStep(null);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [stats?.vector_count]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        <div className="text-center">
          <div className="text-2xl mb-2">Loading RAG Pipeline...</div>
          <div className="text-sm">Initializing vector store</div>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-sm text-red-700 max-w-md">
          <p className="font-semibold mb-1">Failed to load RAG stats</p>
          <p>{error}</p>
          <p className="mt-2 text-xs text-red-500">Make sure the gateway is running on port 3000</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const pipelineStages = stats.pipeline_stages;
  const config = stats.config;

  return (
    <div className="p-6 space-y-6 max-h-screen overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">RAG Pipeline</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Document ingestion, embedding, and hybrid retrieval pipeline
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Live — polling every 10s
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
        <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          Pipeline Stages
        </h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {pipelineStages.map((step: PipelineStage, i: number) => (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`flex flex-col items-center px-4 py-3 rounded-lg border min-w-[120px] transition-all ${
                  activeStep === step.id
                    ? "border-indigo-400 bg-indigo-500/10 scale-105"
                    : "border-[var(--border-color)] bg-[var(--bg-card-alt)]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      activeStep === step.id
                        ? "bg-indigo-500 animate-pulse"
                        : statusColors[step.status] || "bg-gray-400"
                    }`}
                  />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {step.name}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] text-center">
                  {stepDescriptions[step.id] || ""}
                </span>
                <span
                  className={`mt-1 text-[9px] font-medium uppercase tracking-wider ${
                    step.status === "done"
                      ? "text-green-600"
                      : step.status === "ready"
                        ? "text-blue-600"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {statusLabels[step.status] || step.status}
                </span>
              </div>
              {i < pipelineStages.length - 1 && (
                <span className="text-[var(--text-muted)] text-lg shrink-0">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards — from live data */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-medium">Documents Indexed</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{stats.document_count}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">source files</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-medium">Total Chunks</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{stats.vector_count}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">indexed vectors</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-medium">Vector Dimensions</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{config.vector_dimensions}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">TF-IDF features</p>
        </div>
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] p-4">
          <p className="text-xs text-[var(--text-secondary)] font-medium">Search Blend</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">
            {Math.round(config.vector_weight * 100)}/{Math.round(config.keyword_weight * 100)}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">vector / keyword</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Document Queue — from live data */}
        <div className="col-span-2 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Ingestion Queue
            </h2>
            <span className="text-[10px] text-[var(--text-muted)]">
              {stats.documents.length} files indexed
            </span>
          </div>
          <div className="overflow-y-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-card-alt)] text-[var(--text-secondary)] text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">Source File</th>
                  <th className="px-4 py-2 text-left">Deal</th>
                  <th className="px-4 py-2 text-left">Sector</th>
                  <th className="px-4 py-2 text-center">Chunks</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.documents.map((doc, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-card-alt)]">
                    <td className="px-4 py-2 font-mono text-xs text-[var(--text-primary)]">
                      {doc.source_file}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">
                      {doc.deal_id}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          sectorColors[doc.sector] || "bg-gray-100 text-[var(--text-secondary)]"
                        }`}
                      >
                        {doc.sector}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-[var(--text-secondary)]">
                      {doc.chunks}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {doc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RAG Configuration — from live data */}
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]">
          <div className="px-4 py-3 border-b border-[var(--border-color)]">
            <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              RAG Configuration
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {Object.entries(config).map(([key, value]) => (
              <div key={key} className="flex justify-between items-start">
                <span className="text-xs text-[var(--text-secondary)]">
                  {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="text-xs font-medium text-[var(--text-primary)] text-right max-w-[60%]">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
