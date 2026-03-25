import type { ChatThread } from "../../types/chat";

interface ChatThreadsSidebarProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ChatThreadsSidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: ChatThreadsSidebarProps) {
  return (
    <div className="p-4">
      <button
        onClick={onNewThread}
        className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mb-4"
      >
        <span className="text-lg leading-none">+</span>
        New Chat
      </button>

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Threads
      </h2>

      <div className="space-y-1">
        {threads.length === 0 && (
          <p className="text-xs text-gray-600 px-3 py-2">No chat threads yet</p>
        )}
        {threads.map((thread) => (
          <div
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
              activeThreadId === thread.id
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-300"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {thread.title}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {formatRelativeTime(thread.updatedAt)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteThread(thread.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-xs mt-0.5 transition-opacity shrink-0"
              title="Delete thread"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
