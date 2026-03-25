import { useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { DealTable } from "./components/deals/DealTable";
import { TriagePanel } from "./components/deals/TriagePanel";
import { ChatView } from "./components/chat/ChatView";
import RAGPipelinePage from "./pages/RAGPipelinePage";
import GraphExplorerPage from "./pages/GraphExplorerPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import { useDeals } from "./hooks/useDeals";
import { useTriageStream } from "./hooks/useTriageStream";
import { useChatThreads } from "./hooks/useChatThreads";
import { useChat } from "./hooks/useChat";

type ActivePage = "deals" | "chat" | "rag" | "graph" | "audit";

function App() {
  const [activePage, setActivePage] = useState<ActivePage>("deals");
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const { deals, loading, error, refetch } = useDeals();
  const { state: triageState, startTriage, reset } = useTriageStream();
  const {
    threads,
    activeThreadId,
    activeThread,
    setActiveThread,
    createThread,
    deleteThread,
    updateThread,
  } = useChatThreads();

  const chatState = useChat({
    activeThread,
    onUpdateThread: updateThread,
  });

  const handleRunTriage = async (dealId: string) => {
    setSelectedDealId(dealId);
    await startTriage(dealId);
    refetch();
  };

  const handleClosePanel = () => {
    reset();
    setSelectedDealId(null);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        {activePage === "deals" && (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                <h1 className="text-xl font-semibold text-gray-900 mb-4">
                  Deal Pipeline
                </h1>
                <DealTable
                  deals={deals}
                  loading={loading}
                  error={error}
                  triagingDealId={
                    triageState.status === "streaming"
                      ? selectedDealId
                      : null
                  }
                  onRunTriage={handleRunTriage}
                />
              </div>
            </div>
            {selectedDealId && triageState.status !== "idle" && (
              <TriagePanel
                state={triageState}
                dealId={selectedDealId}
                onClose={handleClosePanel}
              />
            )}
          </>
        )}
        {activePage === "chat" && (
          <ChatView
            activeThread={activeThread}
            onUpdateThread={updateThread}
            chatState={chatState}
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={setActiveThread}
            onNewThread={createThread}
            onDeleteThread={deleteThread}
          />
        )}
        {activePage === "rag" && <RAGPipelinePage />}
        {activePage === "graph" && <GraphExplorerPage />}
        {activePage === "audit" && <AuditLogsPage />}
      </main>
    </div>
  );
}

export default App;
