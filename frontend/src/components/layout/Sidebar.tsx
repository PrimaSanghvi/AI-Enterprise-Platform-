import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useTenant } from "../../contexts/TenantContext";

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
  const { theme, toggleTheme } = useTheme();
  const tenant = useTenant();

  return (
    <aside
      className={`bg-[var(--bg-sidebar)] border-r border-[var(--border-sidebar)] shrink-0 flex flex-col h-full overflow-hidden transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--border-sidebar)] shrink-0">
        <img src={tenant.logo} alt={tenant.name} className="h-8 w-8 shrink-0 object-contain" />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-[var(--sidebar-brand)] tracking-tight leading-none">
              {tenant.name}
            </span>
            <span className="text-[9px] text-[var(--sidebar-brand-sub)] font-semibold tracking-wider mt-0.5">
              {tenant.subtitle}
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
                  ? "bg-[var(--bg-sidebar-active)] text-[var(--sidebar-text-active)]"
                  : "text-[var(--sidebar-text)] hover:text-[var(--sidebar-brand)] hover:bg-[var(--bg-sidebar-hover)]"
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

      {/* Theme toggle */}
      <div className="px-2 shrink-0">
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--sidebar-text)] hover:text-[var(--sidebar-brand)] hover:bg-[var(--bg-sidebar-hover)] transition-colors text-sm"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 shrink-0 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 shrink-0 text-indigo-500" />
          )}
          {!collapsed && (
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          )}
        </button>
      </div>

      {/* Collapse button */}
      <div className="border-t border-[var(--border-sidebar)] p-2 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--sidebar-text)] hover:text-[var(--sidebar-brand)] hover:bg-[var(--bg-sidebar-hover)] transition-colors text-sm"
        >
          <span className="text-base shrink-0">{collapsed ? "▶" : "◀"}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
