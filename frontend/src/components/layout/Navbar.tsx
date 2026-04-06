const pageTitles: Record<string, string> = {
  deals: "Deal Pipeline",
  chat: "AI Analyst Chat",
  rag: "RAG Pipeline",
  graph: "Graph Explorer",
};

interface NavbarProps {
  activePage: string;
}

export function Navbar({ activePage }: NavbarProps) {
  return (
    <header className="bg-[var(--bg-card)] border-b border-[var(--border-color)] px-6 h-12 flex items-center shrink-0">
      <h1 className="text-sm font-semibold text-[var(--text-primary)]">
        {pageTitles[activePage] || ""}
      </h1>
    </header>
  );
}
