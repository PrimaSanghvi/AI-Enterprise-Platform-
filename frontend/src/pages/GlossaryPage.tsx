import { useState, useMemo } from "react";
import {
  BookOpen,
  Search,
  Calculator,
  Brain,
  Server,
  Shield,
  DollarSign,
} from "lucide-react";

/* ── Types ── */
type Category = "Finance" | "AI & ML" | "System" | "Security & Ops";

interface GlossaryTerm {
  term: string;
  category: Category;
  definition: string;
  formula?: string;
  context?: string;
}

/* ── Data ── */
const TERMS: GlossaryTerm[] = [
  // ── Finance ──
  {
    term: "IRR (Internal Rate of Return)",
    category: "Finance",
    definition:
      "The discount rate at which the net present value of all cash flows from an investment equals zero. Used to evaluate the profitability of potential investments.",
    formula: "0 = Σ [CFₜ / (1 + IRR)ᵗ] for t = 0 to n",
    context:
      "Displayed in deal triage summaries and financial scenario analysis. The triage agent computes projected IRR based on deal cash flow models retrieved via the Snowflake connector.",
  },
  {
    term: "DSCR (Debt Service Coverage Ratio)",
    category: "Finance",
    definition:
      "The ratio of net operating income to total debt service obligations. A DSCR above 1.0 indicates sufficient income to cover debt payments.",
    formula: "DSCR = Net Operating Income / Total Debt Service",
    context:
      "Used in deal risk assessment. DSCR values below 1.25 trigger risk flags during AI triage.",
  },
  {
    term: "Equity Multiple",
    category: "Finance",
    definition:
      "The total cash distributions received from an investment divided by the total equity invested. Indicates how many times the invested capital is returned.",
    formula: "Equity Multiple = Total Distributions / Total Equity Invested",
    context:
      "Shown in deal pipeline cards and financial hub projections. Helps analysts compare return potential across deals.",
  },
  {
    term: "NPV (Net Present Value)",
    category: "Finance",
    definition:
      "The difference between the present value of cash inflows and outflows over a period. A positive NPV indicates a profitable investment.",
    formula: "NPV = Σ [CFₜ / (1 + r)ᵗ] - Initial Investment",
    context:
      "Computed in financial scenario analysis (Bull/Base/Bear cases) using data from the Snowflake analytics layer.",
  },
  {
    term: "Cap Rate (Capitalization Rate)",
    category: "Finance",
    definition:
      "The ratio of net operating income to the current market value of a property. Used primarily in real estate investment analysis.",
    formula: "Cap Rate = NOI / Current Market Value",
    context:
      "Relevant for real estate sector deals in the pipeline. Displayed in deal metadata retrieved from Backstop CRM.",
  },
  {
    term: "WALT (Weighted Average Lease Term)",
    category: "Finance",
    definition:
      "The average lease term across a property portfolio, weighted by the rental income of each lease. Longer WALTs indicate more stable income streams.",
    formula: "WALT = Σ (Lease Termᵢ × Rentᵢ) / Σ Rentᵢ",
    context:
      "Appears in real estate deal analysis. Longer WALTs are flagged positively during AI triage risk assessment.",
  },
  // ── AI & ML ──
  {
    term: "RAG (Retrieval-Augmented Generation)",
    category: "AI & ML",
    definition:
      "A technique that enhances LLM responses by first retrieving relevant documents from a knowledge base, then using them as context for generation. Reduces hallucination and grounds answers in source data.",
    context:
      "The core retrieval pipeline in the platform. Documents are ingested, chunked, embedded, and indexed in Pinecone. At query time, relevant chunks are retrieved and passed to Claude as grounded context.",
  },
  {
    term: "Embedding Model",
    category: "AI & ML",
    definition:
      "A model that converts text into dense numerical vectors (embeddings) that capture semantic meaning. Similar texts produce similar vectors, enabling semantic search.",
    context:
      "Currently using TF-IDF embeddings (scikit-learn) as a development placeholder. Production deployment will use sentence-transformers or OpenAI embeddings for higher quality retrieval.",
  },
  {
    term: "Reranker Model",
    category: "AI & ML",
    definition:
      "A model applied after initial retrieval to re-score and reorder candidate results for improved relevance. Typically uses cross-encoder architecture for higher accuracy than bi-encoder retrieval.",
    context:
      "The RAG pipeline applies section-boost and entity-match reranking after hybrid retrieval. Improves top-K quality by prioritizing sections like 'Risk Factors' or 'Financial Summary'.",
  },
  {
    term: "Chunk Size & Overlap",
    category: "AI & ML",
    definition:
      "Chunk size is the target length (in tokens) of each document segment for embedding. Overlap is the percentage of shared content between adjacent chunks to preserve context at boundaries.",
    context:
      "Platform defaults: 500–1000 token chunks with 10–20% overlap. Financial tables are kept with explanatory text. Visible in the RAG Pipeline page configuration panel.",
  },
  {
    term: "Agentic Workflow",
    category: "AI & ML",
    definition:
      "An AI workflow where the LLM iteratively calls tools, evaluates results, and decides next steps autonomously. Unlike single-turn Q&A, the agent loops until it has enough context to produce a final answer.",
    context:
      "Deal triage uses an agentic workflow: Claude calls MCP tools (Backstop, Neo4j, Pinecone, Snowflake) in sequence, gathering deal context before producing a structured triage recommendation.",
  },
  {
    term: "Temperature & Top P",
    category: "AI & ML",
    definition:
      "Temperature controls randomness in LLM output (lower = more deterministic). Top P (nucleus sampling) limits token selection to the smallest set whose cumulative probability exceeds P.",
    context:
      "The platform uses low temperature for triage (deterministic, structured output) and moderate temperature for chat (more natural conversation). Configured in the gateway agent settings.",
  },
  // ── System ──
  {
    term: "Connector",
    category: "System",
    definition:
      "An MCP connector is a standardized adapter that exposes an enterprise system's capabilities (read, search, write, action) through the Model Context Protocol. Each connector normalizes access patterns and enforces governance.",
    context:
      "The platform has connectors for Backstop CRM, File Server, Neo4j Graph, Snowflake, and Pinecone. New systems are added by implementing a connector — no core platform changes needed.",
  },
  {
    term: "Graph Entity/Node & Relationship/Edge",
    category: "System",
    definition:
      "In a graph database, entities (companies, investors, people) are nodes, and the connections between them (invested_in, board_member_of, competes_with) are edges/relationships.",
    context:
      "The Neo4j Graph connector exposes entity relationships for deal context. During triage, the agent queries investor networks, competitor maps, and board connections to assess deal relationships.",
  },
  {
    term: "Latency (p95)",
    category: "System",
    definition:
      "The 95th percentile response time — 95% of requests complete within this time. A more meaningful performance metric than average latency because it captures tail performance.",
    context:
      "MCP connector target latency is <2 seconds per call. Chat response target is <5 seconds. Tracked per connector in the audit logs and observability layer.",
  },
  // ── Security & Ops ──
  {
    term: "RBAC (Role-Based Access Control)",
    category: "Security & Ops",
    definition:
      "An access control model where permissions are assigned to roles (e.g., Analyst, Senior Analyst, Platform Admin), and users inherit permissions through their assigned roles.",
    context:
      "Configured via the Policy Engine. Controls Read, Search, Write, and Action permissions per connector per role. Analysts have restricted access with field masking; Platform Admins have full access.",
  },
  {
    term: "Field Restrictions",
    category: "Security & Ops",
    definition:
      "Column-level access controls that mask or redact specific data fields based on the requesting user's role. Prevents sensitive data (PII, financial details) from being exposed to unauthorized roles.",
    context:
      "Displayed on Policy Engine rule cards with a lock icon. For example, Analyst access to Snowflake masks ssn, tax_id, salary, and personal_email fields. Ensures compliance and prevents data leakage to LLMs.",
  },
  {
    term: "Audit Log Deny Rate",
    category: "Security & Ops",
    definition:
      "The percentage of MCP operations that were actively blocked by the Policy Engine. A healthy deny rate indicates the access control system is functioning — zero denies may suggest insufficient governance.",
    context:
      "Visible in the Audit Logs page KPI cards. Deny entries include the triggering policy rule ID (e.g., AUTH-001, RBAC-004) for traceability back to the Policy Engine.",
  },
];

const CATEGORIES: { id: Category | "All"; label: string; icon: typeof BookOpen }[] = [
  { id: "All", label: "All", icon: BookOpen },
  { id: "Finance", label: "Finance", icon: DollarSign },
  { id: "AI & ML", label: "AI & ML", icon: Brain },
  { id: "System", label: "System", icon: Server },
  { id: "Security & Ops", label: "Security & Ops", icon: Shield },
];

function categoryColor(cat: Category) {
  switch (cat) {
    case "Finance":
      return "bg-emerald-500/15 text-emerald-400";
    case "AI & ML":
      return "bg-indigo-500/15 text-indigo-400";
    case "System":
      return "bg-cyan-500/15 text-cyan-400";
    case "Security & Ops":
      return "bg-amber-500/15 text-amber-400";
  }
}

/* ══════════════════════════════════════════════════════════════════════
   GlossaryPage
   ══════════════════════════════════════════════════════════════════════ */

export default function GlossaryPage() {
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    return TERMS.filter((t) => {
      if (activeCategory !== "All" && t.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.term.toLowerCase().includes(q) ||
          t.definition.toLowerCase().includes(q) ||
          (t.context && t.context.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto bg-[#050911]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-400" />
          <h1 className="text-2xl font-bold text-gray-100">
            Glossary & Reference
          </h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Platform terminology across finance, AI/ML, enterprise systems, and
          security operations
        </p>
      </div>

      {/* Category tabs + Search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-[#0c1220] border border-[#1e2d47] rounded-xl p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-[#1e2d47]/50"
              }`}
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-3.5 h-3.5" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search terms, definitions, context…"
            className="w-full bg-[#0c1220] border border-[#1e2d47] text-gray-300 text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Term cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <div
              key={t.term}
              className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 flex flex-col"
            >
              {/* Title + badge */}
              <div className="flex items-start gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-100 flex-1">
                  {t.term}
                </h3>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${categoryColor(t.category)}`}
                >
                  {t.category}
                </span>
              </div>

              {/* Definition */}
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                {t.definition}
              </p>

              {/* Formula */}
              {t.formula && (
                <div className="bg-[#050911] border border-[#1e2d47] rounded-lg px-3 py-2 mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calculator className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-mono uppercase text-gray-500">
                      Formula
                    </span>
                  </div>
                  <code className="text-[11px] text-emerald-300 font-mono">
                    {t.formula}
                  </code>
                </div>
              )}

              {/* Context */}
              {t.context && (
                <div className="border-t border-[#1e2d47] pt-2 mt-auto">
                  <span className="text-[10px] font-mono uppercase text-gray-500">
                    Platform Context
                  </span>
                  <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
                    {t.context}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <BookOpen className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-sm mb-2">No terminology matched your search.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("All");
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
