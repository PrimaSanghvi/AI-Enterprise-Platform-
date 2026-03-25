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
    <header className="bg-white border-b border-gray-200 px-6 h-12 flex items-center shrink-0">
      <h1 className="text-sm font-semibold text-gray-900">
        {pageTitles[activePage] || ""}
      </h1>
    </header>
  );
}
