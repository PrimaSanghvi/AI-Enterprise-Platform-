import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Shield,
  Lock,
  Users,
  Plus,
  Trash2,
  Play,
  Grid3x3,
  Search,
  CheckCircle2,
  XCircle,
  Layers,
  ToggleLeft,
  ToggleRight,
  Info,
} from "lucide-react";
import type {
  PolicyRule,
  Operation,
  CreateRuleInput,
  SimulateInput,
  SimulateResult,
} from "../types/policy";
import {
  fetchPolicyRules,
  createPolicyRule,
  updatePolicyRule,
  deletePolicyRule,
  simulatePolicy,
} from "../api/policy";

/* ── Constants ── */
const ROLES = ["Analyst", "Senior Analyst", "Platform Admin"];
const CONNECTORS = [
  "Backstop CRM",
  "File Server",
  "Neo4j Graph",
  "Snowflake",
  "Pinecone",
  "Appian",
];
const OPERATIONS: Operation[] = ["Read", "Search", "Write", "Action"];

/* ── Helpers ── */
function opColor(op: string) {
  switch (op) {
    case "Read":
      return "bg-teal-500/15 text-teal-400 border-teal-500/20";
    case "Search":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/20";
    case "Write":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "Action":
      return "bg-rose-500/15 text-rose-400 border-rose-500/20";
    default:
      return "bg-gray-500/15 text-[var(--text-muted)] border-gray-500/20";
  }
}

function roleColor(role: string) {
  switch (role) {
    case "Analyst":
      return "bg-blue-500/15 text-blue-400";
    case "Senior Analyst":
      return "bg-indigo-500/15 text-indigo-400";
    case "Platform Admin":
      return "bg-amber-500/15 text-amber-400";
    default:
      return "bg-gray-500/15 text-[var(--text-muted)]";
  }
}

const selectClass =
  "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500";
const btnPrimary =
  "bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5";
const btnGhost =
  "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] text-xs px-3 py-2 rounded-lg transition-colors";

type Tab = "builder" | "matrix" | "simulate";

/* ══════════════════════════════════════════════════════════════════════
   PolicyEnginePage
   ══════════════════════════════════════════════════════════════════════ */

export default function PolicyEnginePage() {
  /* ── State ── */
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("builder");
  const [filterRole, setFilterRole] = useState("");
  const [filterConnector, setFilterConnector] = useState("");

  // New-rule form
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRole, setNewRole] = useState(ROLES[0]);
  const [newConnector, setNewConnector] = useState(CONNECTORS[0]);
  const [newOps, setNewOps] = useState<Set<Operation>>(new Set(["Read"]));
  const [newFields, setNewFields] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Simulate
  const [simRole, setSimRole] = useState(ROLES[0]);
  const [simConnector, setSimConnector] = useState(CONNECTORS[0]);
  const [simOperation, setSimOperation] = useState<string>(OPERATIONS[0]);
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  /* ── Data fetch ── */
  const loadRules = useCallback(async () => {
    try {
      const data = await fetchPolicyRules();
      setRules(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  /* ── KPIs ── */
  const activeCount = useMemo(
    () => rules.filter((r) => r.enabled).length,
    [rules],
  );
  const disabledCount = rules.length - activeCount;
  const fieldRestrictedCount = useMemo(
    () => rules.filter((r) => r.fieldRestrictions.length > 0).length,
    [rules],
  );
  const coveragePairs = useMemo(() => {
    const pairs = new Set<string>();
    rules
      .filter((r) => r.enabled)
      .forEach((r) => pairs.add(`${r.role}::${r.connector}`));
    return pairs.size;
  }, [rules]);
  const totalPairs = ROLES.length * CONNECTORS.length;
  const coveragePct =
    totalPairs > 0 ? ((coveragePairs / totalPairs) * 100).toFixed(0) : "0";

  /* ── Filtered rules ── */
  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (filterRole && r.role !== filterRole) return false;
      if (filterConnector && r.connector !== filterConnector) return false;
      return true;
    });
  }, [rules, filterRole, filterConnector]);

  /* ── Handlers ── */
  const handleToggle = async (rule: PolicyRule) => {
    const updated = await updatePolicyRule(rule.id, {
      enabled: !rule.enabled,
    });
    setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDelete = async (ruleId: string) => {
    await deletePolicyRule(ruleId);
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  const handleCreate = async () => {
    const input: CreateRuleInput = {
      role: newRole,
      connector: newConnector,
      operations: Array.from(newOps),
      fieldRestrictions: newFields
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      rowFilters: {},
      description: newDesc,
      enabled: true,
    };
    const created = await createPolicyRule(input);
    setRules((prev) => [...prev, created]);
    setShowNewRule(false);
    setNewOps(new Set(["Read"]));
    setNewFields("");
    setNewDesc("");
  };

  const handleSimulate = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const input: SimulateInput = {
        role: simRole,
        connector: simConnector,
        operation: simOperation,
      };
      const result = await simulatePolicy(input);
      setSimResult(result);
    } catch (err) {
      setSimResult({
        decision: "Deny",
        matchedRuleId: null,
        maskedFields: [],
        rowFilters: {},
        reasoning: [
          {
            step: 1,
            check: "Error",
            result: (err as Error).message,
          },
        ],
      });
    } finally {
      setSimLoading(false);
    }
  };

  /* ── Loading / Error ── */
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-page)]">
        <div className="text-[var(--text-secondary)] text-sm">Loading policy rules…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--bg-page)]">
        <div className="text-rose-400 text-sm">{error}</div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto bg-[var(--bg-page)]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Policy Engine</h1>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          RBAC governance for MCP connectors — manage rules, view coverage, and
          simulate access decisions
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Active Rules",
            value: `${activeCount}`,
            sub: `${disabledCount} disabled`,
            icon: Shield,
            color: "text-emerald-400",
          },
          {
            label: "Role Coverage",
            value: `${coveragePct}%`,
            sub: `${coveragePairs} of ${totalPairs} pairs`,
            icon: Users,
            color: "text-indigo-400",
          },
          {
            label: "Field Restricted",
            value: `${fieldRestrictedCount}`,
            sub: "rules with PII masking",
            icon: Lock,
            color: "text-amber-400",
          },
          {
            label: "Connectors",
            value: `${CONNECTORS.length}`,
            sub: "enterprise systems",
            icon: Layers,
            color: "text-cyan-400",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                {kpi.label}
              </span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)]">{kpi.value}</div>
            <span className="text-xs font-mono text-[var(--text-secondary)]">{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-1 w-fit">
        {(
          [
            { id: "builder", label: "Rule Builder", icon: Shield },
            { id: "matrix", label: "Coverage Matrix", icon: Grid3x3 },
            { id: "simulate", label: "Simulate", icon: Play },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-indigo-600/20 text-indigo-400"
                : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Rule Builder ── */}
      {activeTab === "builder" && (
        <div className="space-y-4">
          {/* Filters + Add */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className={selectClass}
            >
              <option value="">All Roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={filterConnector}
              onChange={(e) => setFilterConnector(e.target.value)}
              className={selectClass}
            >
              <option value="">All Connectors</option>
              {CONNECTORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <button
              onClick={() => setShowNewRule(!showNewRule)}
              className={btnPrimary}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </button>
          </div>

          {/* New-rule form */}
          {showNewRule && (
            <div className="bg-[var(--bg-card)] border border-indigo-500/30 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                New Policy Rule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                    Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className={selectClass + " w-full"}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                    Connector
                  </label>
                  <select
                    value={newConnector}
                    onChange={(e) => setNewConnector(e.target.value)}
                    className={selectClass + " w-full"}
                  >
                    {CONNECTORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-2 block">
                  Operations
                </label>
                <div className="flex gap-2">
                  {OPERATIONS.map((op) => (
                    <label
                      key={op}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        newOps.has(op)
                          ? opColor(op)
                          : "border-[var(--border-color)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={newOps.has(op)}
                        onChange={() => {
                          const next = new Set(newOps);
                          if (next.has(op)) next.delete(op);
                          else next.add(op);
                          setNewOps(next);
                        }}
                        className="sr-only"
                      />
                      {op}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                  Field Restrictions (comma-separated)
                </label>
                <input
                  value={newFields}
                  onChange={(e) => setNewFields(e.target.value)}
                  placeholder="e.g. ssn, tax_id, salary"
                  className="bg-[var(--bg-page)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 w-full focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                  Description
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  placeholder="Describe what this rule permits or restricts…"
                  className="bg-[var(--bg-page)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded-lg px-3 py-2 w-full focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNewRule(false)}
                  className={btnGhost}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={newOps.size === 0}
                  className={btnPrimary}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Create Rule
                </button>
              </div>
            </div>
          )}

          {/* Rule cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((rule) => (
              <div
                key={rule.id}
                className={`bg-[var(--bg-card)] border rounded-2xl p-4 transition-colors ${
                  rule.enabled
                    ? "border-[var(--border-color)]"
                    : "border-[var(--border-color)]/50 opacity-60"
                }`}
              >
                {/* Top row: ID + role + connector + toggle */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                    {rule.id}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roleColor(rule.role)}`}
                  >
                    {rule.role}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-500/15 text-[var(--text-muted)]">
                    {rule.connector}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => handleToggle(rule)}
                    className="text-[var(--text-muted)] hover:text-white transition-colors"
                    title={rule.enabled ? "Disable rule" : "Enable rule"}
                  >
                    {rule.enabled ? (
                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-[var(--text-secondary)]" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-[var(--text-secondary)] hover:text-rose-400 transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Operations */}
                <div className="flex gap-1.5 mb-2">
                  {rule.operations.map((op) => (
                    <span
                      key={op}
                      className={`text-[10px] font-medium px-2 py-0.5 rounded border ${opColor(op)}`}
                    >
                      {op}
                    </span>
                  ))}
                </div>

                {/* Description */}
                <p className="text-xs text-[var(--text-muted)] mb-2 line-clamp-2">
                  {rule.description}
                </p>

                {/* Field restrictions */}
                {rule.fieldRestrictions.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400/80 font-mono">
                      {rule.fieldRestrictions.join(", ")}
                    </span>
                  </div>
                )}

                {/* Row filters */}
                {Object.keys(rule.rowFilters).length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Search className="w-3 h-3 text-cyan-400" />
                    <span className="text-[10px] text-cyan-400/80 font-mono">
                      {Object.entries(rule.rowFilters)
                        .map(([k, v]) => `${k}: [${v.join(", ")}]`)
                        .join("; ")}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center text-[var(--text-secondary)] text-sm py-12">
              No rules match the current filters.
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Coverage Matrix ── */}
      {activeTab === "matrix" && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  Role / Connector
                </th>
                {CONNECTORS.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-b border-[var(--border-color)]/40">
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColor(role)}`}
                    >
                      {role}
                    </span>
                  </td>
                  {CONNECTORS.map((connector) => {
                    const match = rules.find(
                      (r) =>
                        r.role === role &&
                        r.connector === connector &&
                        r.enabled,
                    );
                    return (
                      <td key={connector} className="px-3 py-3 text-center">
                        {match ? (
                          <div className="flex flex-wrap gap-1 justify-center">
                            {match.operations.map((op) => (
                              <span
                                key={op}
                                className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${opColor(op)}`}
                              >
                                {op[0]}
                              </span>
                            ))}
                            {match.fieldRestrictions.length > 0 && (
                              <Lock className="w-3 h-3 text-amber-400/60 ml-0.5" />
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-[var(--border-color)] flex items-center gap-4 text-[10px] text-[var(--text-secondary)]">
            <span className="font-mono">Legend:</span>
            {OPERATIONS.map((op) => (
              <span key={op} className="flex items-center gap-1">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${opColor(op)}`}
                >
                  {op[0]}
                </span>
                <span>{op}</span>
              </span>
            ))}
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-amber-400/60" />
              <span>Field restrictions</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Tab: Simulate ── */}
      {activeTab === "simulate" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Input panel */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Play className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Policy Simulation
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Test whether a role is authorized for a specific operation on a
              connector. The evaluation runs against real policy rules on the
              server.
            </p>

            <div>
              <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                Role
              </label>
              <select
                value={simRole}
                onChange={(e) => setSimRole(e.target.value)}
                className={selectClass + " w-full"}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                Connector
              </label>
              <select
                value={simConnector}
                onChange={(e) => setSimConnector(e.target.value)}
                className={selectClass + " w-full"}
              >
                {CONNECTORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase text-[var(--text-secondary)] mb-1 block">
                Operation
              </label>
              <select
                value={simOperation}
                onChange={(e) => setSimOperation(e.target.value)}
                className={selectClass + " w-full"}
              >
                {OPERATIONS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSimulate}
              disabled={simLoading}
              className={btnPrimary + " w-full justify-center"}
            >
              {simLoading ? (
                <span className="animate-pulse">Evaluating…</span>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Run Simulation
                </>
              )}
            </button>
          </div>

          {/* Result panel */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5">
            {!simResult && !simLoading && (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] py-12">
                <Info className="w-8 h-8 mb-3 opacity-40" />
                <p className="text-sm">
                  Run a simulation to see the policy decision
                </p>
              </div>
            )}

            {simResult && (
              <div className="space-y-4">
                {/* Decision */}
                <div className="flex items-center gap-3">
                  {simResult.decision === "Allow" ? (
                    <div className="flex items-center gap-2 bg-emerald-500/15 text-emerald-400 px-4 py-2 rounded-xl">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-lg font-bold">ALLOW</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-rose-500/15 text-rose-400 px-4 py-2 rounded-xl">
                      <XCircle className="w-5 h-5" />
                      <span className="text-lg font-bold">DENY</span>
                    </div>
                  )}
                  {simResult.matchedRuleId && (
                    <span className="text-xs font-mono text-[var(--text-secondary)]">
                      Matched: {simResult.matchedRuleId}
                    </span>
                  )}
                </div>

                {/* Masked fields */}
                {simResult.maskedFields.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-400">
                        Masked Fields
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {simResult.maskedFields.map((f) => (
                        <span
                          key={f}
                          className="text-[10px] font-mono bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Row filters */}
                {Object.keys(simResult.rowFilters).length > 0 && (
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Search className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs font-semibold text-cyan-400">
                        Row Filters Applied
                      </span>
                    </div>
                    {Object.entries(simResult.rowFilters).map(([k, v]) => (
                      <div key={k} className="text-[10px] font-mono text-cyan-300">
                        {k}: [{v.join(", ")}]
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasoning trace */}
                <div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2">
                    Evaluation Trace
                  </h4>
                  <div className="space-y-1.5">
                    {simResult.reasoning.map((r) => {
                      const isAllow = r.result.startsWith("ALLOW");
                      const isDeny =
                        r.result.includes("denied") ||
                        r.result.includes("Unknown") ||
                        r.result.includes("not in allowed") ||
                        r.result.includes("disabled");
                      return (
                        <div
                          key={r.step}
                          className="flex items-start gap-2 text-xs"
                        >
                          <span className="text-[10px] font-mono text-[var(--text-secondary)] mt-0.5 w-4 shrink-0">
                            {r.step}.
                          </span>
                          <div>
                            <span className="text-[var(--text-muted)] font-medium">
                              {r.check}
                            </span>
                            <span className="text-[var(--text-secondary)] mx-1.5">—</span>
                            <span
                              className={
                                isAllow
                                  ? "text-emerald-400"
                                  : isDeny
                                    ? "text-rose-400"
                                    : "text-[var(--text-primary)]"
                              }
                            >
                              {r.result}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
