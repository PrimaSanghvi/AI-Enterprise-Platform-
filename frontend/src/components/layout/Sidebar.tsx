import { useState } from "react";

type ActivePage = "overview" | "deals" | "chat" | "rag" | "graph" | "audit" | "policy" | "glossary";

/* ── Navigation items ── */
const navItems: { id: ActivePage; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🏠" },
  { id: "deals", label: "Deal Pipeline", icon: "📊" },
  { id: "chat", label: "AI Chat", icon: "💬" },
  { id: "graph", label: "Graph Explorer", icon: "🕸️" },
  { id: "audit", label: "Audit Logs", icon: "📋" },
  { id: "policy", label: "Policy Engine", icon: "🛡️" },
  { id: "glossary", label: "Glossary", icon: "📖" },
];

interface SidebarProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
}

export function Sidebar({
  activePage,
  onNavigate,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`bg-gray-900 border-r border-gray-800 shrink-0 flex flex-col h-full overflow-hidden transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-800 shrink-0">
        <img src="/cogniify_logo.png" alt="Cogniify" className="h-8 w-8 shrink-0 object-contain" />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white tracking-tight leading-none">
              COGNIIFY
            </span>
            <span className="text-[9px] text-gray-500 font-semibold tracking-wider mt-0.5">
              AI ENTERPRISE PLATFORM
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-2 py-3 space-y-1 shrink-0">
        {navItems.map((item) => {
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collapse button */}
      <div className="border-t border-gray-800 p-2 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors text-sm"
        >
          <span className="text-base shrink-0">{collapsed ? "▶" : "◀"}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
