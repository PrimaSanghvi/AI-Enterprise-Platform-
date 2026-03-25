import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  Shield,
  AlertTriangle,
  ChevronDown,
  User,
  Bot,
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

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

/* ── Types ── */

interface AuditLog {
  id: string;
  timestamp: string;
  date: string;
  user: string;
  userType: "human" | "system" | "external";
  connector: string;
  operation: "Read" | "Write" | "Search" | "Action";
  resource: string;
  dealRef?: string;
  latencyMs: number | null;
  decision: "Allow" | "Deny";
  reason?: string;
  policyRule?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

/* ── Connector badge colors ── */

function connectorColor(name: string): { bg: string; text: string } {
  if (name.includes("Backstop")) return { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" };
  if (name.includes("Neo4j")) return { bg: "rgba(129,140,248,0.15)", text: "#818cf8" };
  if (name.includes("Pinecone")) return { bg: "rgba(34,211,238,0.15)", text: "#22d3ee" };
  if (name.includes("Snowflake")) return { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" };
  if (name.includes("File")) return { bg: "rgba(20,184,166,0.15)", text: "#14b8a6" };
  if (name.includes("Appian")) return { bg: "rgba(16,185,129,0.15)", text: "#10b981" };
  return { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" };
}

/* ── Component ── */

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDecision, setFilterDecision] = useState<"all" | "Allow" | "Deny">("all");
  const [filterConnector, setFilterConnector] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/audit/logs`)
      .then((res) => res.json())
      .then((data: AuditLog[]) => {
        setLogs(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const connectors = useMemo(() => [...new Set(logs.map((l) => l.connector))], [logs]);
  const users = useMemo(() => [...new Set(logs.map((l) => l.user))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filterDecision !== "all" && l.decision !== filterDecision) return false;
      if (filterConnector !== "all" && l.connector !== filterConnector) return false;
      if (filterUser !== "all" && l.user !== filterUser) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          l.resource.toLowerCase().includes(q) ||
          l.user.toLowerCase().includes(q) ||
          l.connector.toLowerCase().includes(q) ||
          (l.dealRef && l.dealRef.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [logs, filterDecision, filterConnector, filterUser, searchQuery]);

  /* KPIs */
  const totalOps = filtered.length;
  const denyCount = filtered.filter((l) => l.decision === "Deny").length;
  const denyRate = totalOps > 0 ? ((denyCount / totalOps) * 100).toFixed(1) : "0.0";
  const latencyItems = filtered.filter((l) => l.latencyMs !== null);
  const avgLatency =
    latencyItems.length > 0
      ? Math.round(latencyItems.reduce((a, l) => a + (l.latencyMs ?? 0), 0) / latencyItems.length)
      : 0;
  const slowOps = filtered.filter((l) => l.latencyMs !== null && l.latencyMs > 500).length;

  /* Bar chart — operations by connector */
  const opsByConnector: Record<string, number> = {};
  filtered.forEach((l) => {
    opsByConnector[l.connector] = (opsByConnector[l.connector] || 0) + 1;
  });

  const barData = {
    labels: Object.keys(opsByConnector),
    datasets: [
      {
        label: "Total Operations",
        data: Object.values(opsByConnector),
        backgroundColor: "rgba(56, 189, 248, 0.8)",
        borderRadius: 4,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255,255,255,0.05)" },
        border: { display: false },
        ticks: { color: "#64748b", stepSize: 1 },
      },
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#64748b" },
      },
    },
  };

  /* Doughnut chart — operations by type */
  const opsByType: Record<string, number> = { Read: 0, Write: 0, Search: 0, Action: 0 };
  filtered.forEach((l) => (opsByType[l.operation] = (opsByType[l.operation] || 0) + 1));

  const doughnutData = {
    labels: Object.keys(opsByType),
    datasets: [
      {
        data: Object.values(opsByType),
        backgroundColor: [
          "rgba(56, 189, 248, 0.8)",
          "rgba(245, 158, 11, 0.8)",
          "rgba(167, 139, 250, 0.8)",
          "rgba(52, 211, 153, 0.8)",
        ],
        borderWidth: 0,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: {
        position: "right" as const,
        labels: { color: "#94a3b8", usePointStyle: true, boxWidth: 6 },
      },
    },
  };

  const selectClass =
    "bg-[#0f1729] text-xs text-gray-300 rounded-lg px-3 py-2 outline-none border border-[#1e2d47] focus:border-blue-500/50";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#050911]">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Loading audit logs...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-[#050911]">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-sm text-rose-400">
          Failed to load audit logs: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto bg-[#050911]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100 tracking-tight">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every MCP interaction logged — user, system, action, timestamp, policy decision
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Operations", value: totalOps.toString(), sub: "Last 30 minutes", up: true },
          { label: "Deny Rate", value: `${denyRate}%`, sub: `${denyCount} blocked`, up: denyCount === 0, mono: true },
          { label: "Avg Latency", value: `${avgLatency}ms`, sub: avgLatency < 300 ? "Within SLA" : "Above SLA", up: avgLatency < 300, mono: true },
          { label: "Slow Operations", value: slowOps.toString(), sub: "> 500ms threshold", up: slowOps === 0, mono: true },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 transition-colors hover:border-[#2a3a55]"
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-gray-500">
              {kpi.label}
            </span>
            <div className={`text-xl font-bold text-gray-100 mt-1 ${kpi.mono ? "font-mono" : ""}`}>
              {kpi.value}
            </div>
            <span className={`text-xs font-mono ${kpi.up ? "text-emerald-500" : "text-rose-500"}`}>
              {kpi.sub}
            </span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 transition-colors hover:border-[#2a3a55] flex flex-col h-[260px]">
          <h3 className="text-sm font-bold text-gray-100 mb-4">Operations by Connector</h3>
          <div className="flex-1 relative">
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
        <div className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl p-4 transition-colors hover:border-[#2a3a55] flex flex-col h-[260px]">
          <h3 className="text-sm font-bold text-gray-100 mb-4">Operations by Type</h3>
          <div className="flex-1 relative">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by resource, user, connector, deal..."
            className="w-full bg-[#0f1729] rounded-lg pl-9 pr-4 py-2 text-xs text-gray-200 placeholder:text-gray-600 outline-none border border-[#1e2d47] focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          <select value={filterDecision} onChange={(e) => setFilterDecision(e.target.value as "all" | "Allow" | "Deny")} className={selectClass}>
            <option value="all">All Decisions</option>
            <option value="Allow">Allow Only</option>
            <option value="Deny">Deny Only</option>
          </select>
          <select value={filterConnector} onChange={(e) => setFilterConnector(e.target.value)} className={selectClass}>
            <option value="all">All Connectors</option>
            {connectors.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className={selectClass}>
            <option value="all">All Users</option>
            {users.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <span className="text-[10px] font-mono text-gray-500">
          {filtered.length}/{logs.length} shown
        </span>
      </div>

      {/* Log Table */}
      <div className="bg-[#0c1220] border border-[#1e2d47] rounded-2xl overflow-hidden transition-colors hover:border-[#2a3a55]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2d47] text-left">
              {["", "Time", "User", "Connector", "Op", "Resource", "Latency", "Decision"].map((h) => (
                <th key={h} className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, i) => {
              const isExpanded = expandedId === l.id;
              const isDeny = l.decision === "Deny";
              const isSlow = l.latencyMs !== null && l.latencyMs > 500;
              const cc = connectorColor(l.connector);

              return (
                <React.Fragment key={l.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : l.id)}
                    className={`border-b border-[#1e2d47]/40 hover:bg-[#0f1729]/50 transition-colors cursor-pointer ${isDeny ? "bg-rose-500/5" : ""}`}
                    style={{ animationDelay: `${i * 25}ms` }}
                  >
                    <td className="px-3 py-2.5 w-6">
                      <ChevronDown
                        className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-gray-200">{l.timestamp}</span>
                      <span className="block text-[9px] font-mono text-gray-500">{l.date}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {l.userType === "human" ? (
                          <User className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : l.userType === "system" ? (
                          <Bot className="w-3 h-3 text-blue-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                        )}
                        <span className={`text-xs ${isDeny ? "text-rose-400" : "text-gray-200"}`}>
                          {l.user}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium"
                        style={{ backgroundColor: cc.bg, color: cc.text }}
                      >
                        {l.connector}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                          l.operation === "Write"
                            ? "bg-amber-500/15 text-amber-400"
                            : l.operation === "Action"
                              ? "bg-indigo-500/15 text-indigo-400"
                              : "bg-[#0f1729] text-gray-400"
                        }`}
                      >
                        {l.operation}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[220px] truncate">
                      {l.resource}
                      {l.dealRef && (
                        <span className="ml-1 font-mono text-[9px] text-blue-400">{l.dealRef}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-mono text-[11px] ${
                          l.latencyMs === null
                            ? "text-gray-600"
                            : isSlow
                              ? "text-amber-400 font-bold"
                              : "text-gray-200"
                        }`}
                      >
                        {l.latencyMs !== null ? `${l.latencyMs.toLocaleString()}ms` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium ${
                          l.decision === "Allow"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            l.decision === "Allow" ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                        />
                        {l.decision}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && (
                    <tr className="bg-[#0a0f1a]">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="flex gap-6 text-xs animate-[fadeIn_0.3s_ease-out]">
                          <div className="space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                              Full Resource
                            </p>
                            <p className="text-gray-200">{l.resource}</p>
                          </div>
                          {l.dealRef && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                                Deal Reference
                              </p>
                              <p className="text-gray-200 font-mono">{l.dealRef}</p>
                            </div>
                          )}
                          <div className="space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                              User Type
                            </p>
                            <p className="text-gray-200 capitalize">{l.userType}</p>
                          </div>
                          {l.reason && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                <Shield className="w-3 h-3 text-rose-400" /> Deny Reason
                              </p>
                              <p className="text-rose-400">{l.reason}</p>
                            </div>
                          )}
                          {l.policyRule && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                                Policy Rule
                              </p>
                              <p className="text-gray-200 font-mono font-bold">{l.policyRule}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="w-8 h-8 text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">No logs match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
