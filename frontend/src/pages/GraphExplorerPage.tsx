import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Building2,
  User,
  Landmark,
  Briefcase,
  FileText,
  Brain,
  Network,
} from "lucide-react";

/* ── Types ── */

type NodeType = "company" | "investor" | "board_member" | "competitor" | "partner";

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  sector?: string;
  stage?: string;
  details?: string;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  details: string;
}

/* ── Theme ── */

const TYPE_FILL: Record<NodeType, string> = {
  company: "#3b82f6",
  investor: "#10b981",
  board_member: "#f59e0b",
  competitor: "#f43f5e",
  partner: "#818cf8",
};

const TYPE_ICON: Record<NodeType, React.ElementType> = {
  company: Building2,
  investor: Landmark,
  board_member: User,
  competitor: Briefcase,
  partner: FileText,
};

const TYPE_LABEL: Record<NodeType, string> = {
  company: "Company",
  investor: "Investor",
  board_member: "Board Member",
  competitor: "Competitor",
  partner: "Partner",
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

/* ── Layout helper ── */

function computePositions(
  nodes: Omit<GraphNode, "x" | "y">[],
  edges: GraphEdge[]
): GraphNode[] {
  const companies = nodes.filter((n) => n.type === "company");
  const others = nodes.filter((n) => n.type !== "company");

  const cx = 50,
    cy = 45;

  // Place companies in a wider ellipse with more breathing room
  const companyPositions = new Map<string, { x: number; y: number }>();
  companies.forEach((c, i) => {
    const angle = (2 * Math.PI * i) / companies.length - Math.PI / 2;
    const rx = 34,
      ry = 28;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    companyPositions.set(c.id, { x, y });
  });

  // Group non-company nodes by their connected company
  const nodeCompany = new Map<string, string[]>();
  for (const e of edges) {
    const compId = companyPositions.has(e.source) ? e.source : e.target;
    const otherId = compId === e.source ? e.target : e.source;
    if (!companyPositions.has(otherId)) {
      if (!nodeCompany.has(otherId)) nodeCompany.set(otherId, []);
      nodeCompany.get(otherId)!.push(compId);
    }
  }

  // Count children per company first for even angular distribution
  const companyChildren = new Map<string, Omit<GraphNode, "x" | "y">[]>();
  for (const node of others) {
    const connected = nodeCompany.get(node.id) || [];
    const primary = connected[0];
    if (!primary) continue;
    if (!companyChildren.has(primary)) companyChildren.set(primary, []);
    companyChildren.get(primary)!.push(node);
  }

  const otherPositions = new Map<string, { x: number; y: number }>();

  for (const [compId, children] of companyChildren) {
    const compPos = companyPositions.get(compId)!;
    const count = children.length;

    // Direction from center outward through company
    const outAngle = Math.atan2(compPos.y - cy, compPos.x - cx);

    // Fan children in an arc on the outward side of the company
    const arcSpread = Math.min(Math.PI * 0.9, count * 0.45);
    const startAngle = outAngle - arcSpread / 2;

    children.forEach((node, idx) => {
      const fraction = count === 1 ? 0.5 : idx / (count - 1);
      const angle = startAngle + fraction * arcSpread;

      // Stagger distances: alternate between two rings
      const dist = idx % 2 === 0 ? 10 : 15;
      const x = compPos.x + dist * Math.cos(angle);
      const y = compPos.y + dist * Math.sin(angle);

      otherPositions.set(node.id, {
        x: Math.max(3, Math.min(97, x)),
        y: Math.max(3, Math.min(87, y)),
      });
    });
  }

  // Handle orphan nodes
  for (const node of others) {
    if (!otherPositions.has(node.id)) {
      otherPositions.set(node.id, {
        x: 5 + Math.random() * 90,
        y: 5 + Math.random() * 80,
      });
    }
  }

  return nodes.map((n) => {
    const pos =
      companyPositions.get(n.id) || otherPositions.get(n.id) || { x: 50, y: 45 };
    return { ...n, x: pos.x, y: pos.y } as GraphNode;
  });
}

/* ── Component ── */

export default function GraphExplorerPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/graph/data`)
      .then((res) => res.json())
      .then((data: { nodes: Omit<GraphNode, "x" | "y">[]; edges: GraphEdge[] }) => {
        const positioned = computePositions(data.nodes, data.edges);
        setNodes(positioned);
        setEdges(data.edges);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        (n.sector && n.sector.toLowerCase().includes(q))
    );
  }, [searchQuery, nodes]);

  const connectedEdges = useMemo(() => {
    if (!selected) return [];
    return edges.filter((e) => e.source === selected || e.target === selected);
  }, [selected, edges]);

  const connectedNodes = useMemo(() => {
    if (!selected) return [];
    const ids = new Set(
      connectedEdges.flatMap((e) => [e.source, e.target]).filter((id) => id !== selected)
    );
    return nodes.filter((n) => ids.has(n.id));
  }, [selected, connectedEdges, nodes]);

  const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Loading graph data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-sm text-red-400">
          Failed to load graph: {error}
        </div>
      </div>
    );
  }

  const entityTypes = [...new Set(nodes.map((n) => n.type))] as NodeType[];
  const relationshipTypes = new Set(edges.map((e) => e.relationship));

  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto bg-[var(--bg-page)]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
          Graph Explorer
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Neo4j entity relationships — companies, investors, board members, competitors & partners
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Entities",
            value: nodes.length.toString(),
            sub: `${nodes.filter((n) => n.type === "company").length} companies`,
          },
          {
            label: "Relationships",
            value: edges.length.toString(),
            sub: `${relationshipTypes.size} types`,
            mono: true,
          },
          {
            label: "Avg Connections",
            value: nodes.length ? ((edges.length * 2) / nodes.length).toFixed(1) : "0",
            sub: "Per entity",
            mono: true,
          },
          {
            label: "Graph Density",
            value:
              nodes.length > 1
                ? (
                    (edges.length / ((nodes.length * (nodes.length - 1)) / 2)) *
                    100
                  ).toFixed(1) + "%"
                : "0%",
            sub: "Sparse — room to grow",
            mono: true,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 transition-colors hover:border-[var(--border-color)]"
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">
              {kpi.label}
            </span>
            <div
              className={`text-xl font-bold text-[var(--text-primary)] mt-1 ${kpi.mono ? "font-mono" : ""}`}
            >
              {kpi.value}
            </div>
            <span className="text-xs font-mono text-emerald-500">{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* Search + Legend */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            size={16}
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities by name or type..."
            className="w-full bg-[var(--bg-card-alt)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none border border-[var(--border-color)] focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>
        <div className="flex gap-2">
          {entityTypes.map((type) => (
            <div
              key={type}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-xs text-[var(--text-muted)]"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_FILL[type] }}
              />
              {TYPE_LABEL[type] || type}
            </div>
          ))}
        </div>
      </div>

      {/* Graph + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph Canvas */}
        <div
          className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-0 overflow-hidden transition-colors hover:border-[var(--border-color)]"
          style={{ height: 520 }}
        >
          <svg viewBox="0 0 100 90" className="w-full h-full">
            {/* Edges */}
            {edges.map((edge, i) => {
              const a = nodes.find((n) => n.id === edge.source);
              const b = nodes.find((n) => n.id === edge.target);
              if (!a || !b) return null;

              const isHighlighted = selected === edge.source || selected === edge.target;
              const eitherVisible = visibleNodeIds.has(a.id) && visibleNodeIds.has(b.id);
              if (!eitherVisible) return null;

              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isHighlighted ? "#3b82f6" : "#1e2d47"}
                  strokeWidth={isHighlighted ? 0.5 : 0.2}
                  opacity={selected && !isHighlighted ? 0.1 : 0.5}
                  className="transition-all duration-300"
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              const isSelected = selected === n.id;
              const isConnected = selected
                ? edges.some(
                    (e) =>
                      (e.source === selected && e.target === n.id) ||
                      (e.target === selected && e.source === n.id)
                  )
                : false;
              const dimmed =
                (selected && !isSelected && !isConnected) || !visibleNodeIds.has(n.id);
              const isCompany = n.type === "company";

              return (
                <g
                  key={n.id}
                  onClick={() => setSelected(isSelected ? null : n.id)}
                  className="cursor-pointer"
                >
                  {/* Glow ring for selected */}
                  {isSelected && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={isCompany ? 4.2 : 3.5}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={0.3}
                      opacity={0.4}
                    >
                      <animate
                        attributeName="opacity"
                        values="0.4;0.15;0.4"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={isSelected ? 2.8 : isCompany ? 2.4 : 1.6}
                    fill={TYPE_FILL[n.type] || "#9ca3af"}
                    opacity={dimmed ? 0.12 : 1}
                    className="transition-all duration-300"
                  />
                  <text
                    x={n.x}
                    y={n.y + (isSelected ? 4.8 : isCompany ? 4.4 : 3.4)}
                    textAnchor="middle"
                    fill={dimmed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)"}
                    fontSize={isSelected ? 1.8 : isCompany ? 1.6 : 1.3}
                    className="transition-all duration-300"
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Detail Panel */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 transition-colors hover:border-[var(--border-color)]">
          {selectedNode ? (
            <div className="space-y-4 animate-[fadeIn_0.4s_ease-out]">
              {/* Header */}
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: TYPE_FILL[selectedNode.type] + "22" }}
                >
                  {(() => {
                    const Icon = TYPE_ICON[selectedNode.type] || Network;
                    return <Icon className="w-4 h-4 text-[var(--text-primary)]" />;
                  })()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    {selectedNode.label}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium"
                    style={{
                      backgroundColor: TYPE_FILL[selectedNode.type] + "22",
                      color: TYPE_FILL[selectedNode.type],
                    }}
                  >
                    {TYPE_LABEL[selectedNode.type] || selectedNode.type}
                  </span>
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-2">
                {selectedNode.sector && (
                  <div className="flex justify-between text-xs py-1 border-b border-[var(--border-color)]/60">
                    <span className="text-[var(--text-secondary)]">Sector</span>
                    <span className="font-mono text-[var(--text-primary)] font-bold">
                      {selectedNode.sector}
                    </span>
                  </div>
                )}
                {selectedNode.stage && (
                  <div className="flex justify-between text-xs py-1 border-b border-[var(--border-color)]/60">
                    <span className="text-[var(--text-secondary)]">Stage</span>
                    <span className="font-mono text-[var(--text-primary)] font-bold">
                      {selectedNode.stage}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs py-1 border-b border-[var(--border-color)]/60">
                  <span className="text-[var(--text-secondary)]">Connections</span>
                  <span className="font-mono text-[var(--text-primary)] font-bold">
                    {connectedEdges.length}
                  </span>
                </div>
              </div>

              {/* Connected entities */}
              {connectedNodes.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                    Connected Entities
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {connectedEdges.map((edge, i) => {
                      const otherId =
                        edge.source === selected ? edge.target : edge.source;
                      const other = nodes.find((n) => n.id === otherId);
                      if (!other) return null;
                      const isOutgoing = edge.source === selected;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelected(other.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[var(--bg-card-alt)]/50 hover:bg-[var(--bg-card-alt)] border border-transparent hover:border-[var(--border-color)] transition-colors text-left"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                TYPE_FILL[other.type as NodeType] || "#9ca3af",
                            }}
                          />
                          <span className="text-xs text-[var(--text-primary)] font-medium flex-1 truncate">
                            {other.label}
                          </span>
                          <span className="text-[9px] font-mono text-[var(--text-secondary)] shrink-0">
                            {isOutgoing ? "" : "\u2190 "}
                            {edge.relationship.replace(/_/g, " ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI Summary */}
              {selectedNode.details && (
                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3 h-3 text-indigo-400" />
                    <p className="text-[10px] font-mono text-indigo-400 font-bold">
                      AI Entity Summary
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    {selectedNode.details}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Network className="w-10 h-10 text-[var(--text-secondary)] mb-3" />
              <p className="text-sm text-[var(--text-secondary)]">Click any node to explore</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {nodes.length} entities &middot; {edges.length} relationships
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
