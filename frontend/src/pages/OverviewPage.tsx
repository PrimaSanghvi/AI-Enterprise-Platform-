import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  DollarSign,
  TrendingUp,
  Shield,
  MessageSquare,
  Share2,
  FileText,
  BookOpen,
  ArrowRight,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
);

/* ── Types for fetched data ── */
interface Deal {
  deal_id: string;
  company_name: string;
  sector: string;
  stage: string;
  status: string;
  ask_amount: number;
  valuation: number;
  triage_results: { decision: string }[];
  triage_status: string;
}

interface AuditLog {
  decision: string;
}

interface GraphData {
  nodes: unknown[];
  edges: unknown[];
}

interface PolicyRule {
  enabled: boolean;
  role: string;
  connector: string;
}

type ActivePage =
  | "overview"
  | "deals"
  | "chat"
  | "rag"
  | "graph"
  | "audit"
  | "policy"
  | "glossary";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

const ROLES = ["Analyst", "Senior Analyst", "Platform Admin"];
const CONNECTORS = [
  "Backstop CRM",
  "File Server",
  "Neo4j Graph",
  "Snowflake",
  "Pinecone",
  "Appian",
];

/* ── Chart options ── */
const chartFont = { family: "ui-monospace, monospace", size: 10 };

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { titleFont: chartFont, bodyFont: chartFont },
  },
  scales: {
    x: {
      ticks: { color: "#6b7280", font: chartFont },
      grid: { color: "#1e2d47" },
    },
    y: {
      ticks: { color: "#6b7280", font: chartFont },
      grid: { color: "#1e2d47" },
      beginAtZero: true,
    },
  },
} as const;

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { color: "#9ca3af", font: chartFont, padding: 12 },
    },
    tooltip: { titleFont: chartFont, bodyFont: chartFont },
  },
} as const;

const STATUS_COLORS: Record<string, string> = {
  screening: "#6366f1",
  due_diligence: "#f59e0b",
  ic_review: "#10b981",
  closed: "#6b7280",
};

const SECTOR_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#06b6d4", "#f43f5e", "#8b5cf6"];

/* ══════════════════════════════════════════════════════════════════════
   OverviewPage
   ══════════════════════════════════════════════════════════════════════ */

interface OverviewPageProps {
  onNavigate: (page: ActivePage) => void;
}

export default function OverviewPage({ onNavigate }: OverviewPageProps) {
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [policyRules, setPolicyRules] = useState<PolicyRule[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/deals`).then((r) => r.json()),
      fetch(`${API_BASE}/audit/logs`).then((r) => r.json()),
      fetch(`${API_BASE}/graph/data`).then((r) => r.json()),
      fetch(`${API_BASE}/policy/rules`).then((r) => r.json()),
    ])
      .then(([d, a, g, p]) => {
        setDeals(d);
        setAuditLogs(a);
        setGraphData(g);
        setPolicyRules(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── KPIs ── */
  const totalAUM = useMemo(
    () => deals.reduce((sum, d) => sum + (d.valuation || 0), 0),
    [deals],
  );
  const triageCompleted = useMemo(
    () => deals.filter((d) => d.triage_results && d.triage_results.length > 0).length,
    [deals],
  );
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    deals.forEach((d) => {
      counts[d.status] = (counts[d.status] || 0) + 1;
    });
    return counts;
  }, [deals]);

  const activeRules = useMemo(
    () => policyRules.filter((r) => r.enabled).length,
    [policyRules],
  );
  const policyCoverage = useMemo(() => {
    const pairs = new Set<string>();
    policyRules
      .filter((r) => r.enabled)
      .forEach((r) => pairs.add(`${r.role}::${r.connector}`));
    const total = ROLES.length * CONNECTORS.length;
    return total > 0 ? Math.round((pairs.size / total) * 100) : 0;
  }, [policyRules]);

  const auditDenyRate = useMemo(() => {
    if (auditLogs.length === 0) return "0.0";
    const denies = auditLogs.filter((l) => l.decision === "Deny").length;
    return ((denies / auditLogs.length) * 100).toFixed(1);
  }, [auditLogs]);

  /* ── Charts ── */
  const sectorData = useMemo(() => {
    const counts: Record<string, number> = {};
    deals.forEach((d) => {
      counts[d.sector] = (counts[d.sector] || 0) + 1;
    });
    const labels = Object.keys(counts);
    return {
      labels,
      datasets: [
        {
          data: labels.map((l) => counts[l]),
          backgroundColor: labels.map((_, i) => SECTOR_COLORS[i % SECTOR_COLORS.length]),
          borderRadius: 6,
          barThickness: 32,
        },
      ],
    };
  }, [deals]);

  const statusData = useMemo(() => {
    const labels = Object.keys(statusCounts);
    return {
      labels: labels.map((l) => l.replace("_", " ")),
      datasets: [
        {
          data: labels.map((l) => statusCounts[l]),
          backgroundColor: labels.map(
            (l) => STATUS_COLORS[l] || "#6b7280",
          ),
          borderWidth: 0,
        },
      ],
    };
  }, [statusCounts]);

  /* ── Navigation cards config ── */
  const navCards = useMemo(
    () => [
      {
        id: "deals" as ActivePage,
        icon: Briefcase,
        title: "Deal Pipeline",
        metrics: [
          `${statusCounts["screening"] || 0} screening`,
          `${statusCounts["due_diligence"] || 0} in review`,
        ],
        color: "text-indigo-400",
      },
      {
        id: "chat" as ActivePage,
        icon: MessageSquare,
        title: "AI Chat",
        metrics: ["Claude-powered copilot", "Multi-turn tool use"],
        color: "text-cyan-400",
      },
      {
        id: "graph" as ActivePage,
        icon: Share2,
        title: "Graph Explorer",
        metrics: [
          `${graphData?.nodes.length ?? "—"} nodes`,
          `${graphData?.edges.length ?? "—"} edges`,
        ],
        color: "text-rose-400",
      },
      {
        id: "audit" as ActivePage,
        icon: FileText,
        title: "Audit Logs",
        metrics: [
          `${auditLogs.length} operations`,
          `${auditDenyRate}% deny rate`,
        ],
        color: "text-amber-400",
      },
      {
        id: "policy" as ActivePage,
        icon: Shield,
        title: "Policy Engine",
        metrics: [
          `${activeRules} active rules`,
          `${policyCoverage}% coverage`,
        ],
        color: "text-purple-400",
      },
      {
        id: "glossary" as ActivePage,
        icon: BookOpen,
        title: "Glossary",
        metrics: ["17 terms", "4 categories"],
        color: "text-gray-400",
      },
    ],
    [statusCounts, graphData, auditLogs, auditDenyRate, activeRules, policyCoverage],
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#050911]">
        <div className="text-gray-500 text-sm">Loading dashboard…</div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto bg-[#050911]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-indigo-400" />
          <h1 className="text-2xl font-bold text-gray-100">Overview</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Real-time platform metrics across deal pipeline, AI systems, and
          governance
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total AUM",
            value: `$${(totalAUM / 1_000_000).toFixed(0)}M`,
            sub: `${deals.length} deals in portfolio`,
            icon: DollarSign,
            color: "text-emerald-400",
          },
          {
            label: "Deals In Pipeline",
            value: `${deals.length}`,
            sub: `${statusCounts["screening"] || 0} screening, ${statusCounts["due_diligence"] || 0} diligence`,
            icon: TrendingUp,
            color: "text-indigo-400",
          },
          {
            label: "Triage Completed",
            value: `${triageCompleted}`,
            sub: `of ${deals.length} total deals`,
            icon: CheckCircle2,
            color: "text-cyan-400",
          },
          {
            label: "Policy Rules",
            value: `${activeRules}`,
            sub: `${policyCoverage}% role coverage`,
            icon: Shield,
            color: "text-amber-400",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
              <span className="text-[11px] font-mono uppercase tracking-wider text-gray-500">
                {kpi.label}
              </span>
            </div>
            <div className="text-xl font-bold text-gray-100">{kpi.value}</div>
            <span className="text-xs font-mono text-gray-500">{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bar: Deals by Sector */}
        <div className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 flex flex-col">
          <h3 className="text-sm font-bold text-gray-100 mb-4">
            Deals by Sector
          </h3>
          <div className="flex-1 relative min-h-[200px]">
            <Bar data={sectorData} options={barOptions} />
          </div>
        </div>

        {/* Doughnut: Pipeline Status */}
        <div className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 flex flex-col">
          <h3 className="text-sm font-bold text-gray-100 mb-4">
            Pipeline by Status
          </h3>
          <div className="flex-1 relative min-h-[200px] flex items-center justify-center">
            <div className="w-[220px] h-[220px]">
              <Doughnut data={statusData} options={doughnutOptions} />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation cards */}
      <div>
        <h3 className="text-sm font-bold text-gray-100 mb-3">
          Platform Modules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {navCards.map((card) => (
            <button
              key={card.id}
              onClick={() => onNavigate(card.id)}
              className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 text-left hover:border-indigo-500/40 transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                  <span className="text-sm font-semibold text-gray-100">
                    {card.title}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="space-y-0.5">
                {card.metrics.map((m, i) => (
                  <div key={i} className="text-xs font-mono text-gray-500">
                    {m}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
