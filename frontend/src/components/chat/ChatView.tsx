import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatThread, IntentClassifiedEvent, ChatStreamState } from "../../types/chat";
import type { StreamEvent, ToolCallEvent, ToolResultEvent } from "../../types/triage";
import { ChatThreadsSidebar } from "./ChatThreadsSidebar";

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 text-sm ${
          isUser
            ? "bg-gray-900 text-white"
            : "bg-white border border-gray-200 text-gray-800"
        }`}
      >
        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {msg.sources.map((src, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                >
                  {src.title}
                  {src.deal_id && (
                    <span className="text-blue-400">({src.deal_id})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.toolsUsed.map((tool, i) => (
              <span
                key={i}
                className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono"
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STRATEGY_LABELS: Record<string, string> = {
  graph: "Graph Query — checking relationships",
  structured: "Structured Lookup — querying analytics",
  vector: "Vector Search — searching documents",
  lookup: "Record Lookup — fetching deal data",
  hybrid: "Hybrid Query — multiple data sources",
};

function StreamingIndicator({
  events,
  intent,
}: {
  events: StreamEvent[];
  intent?: IntentClassifiedEvent | null;
}) {
  if (events.length === 0 && !intent) {
    return (
      <div className="flex justify-start">
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Thinking...
          </span>
        </div>
      </div>
    );
  }

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const toolName = lastEvent
    ? lastEvent.type === "tool_call"
      ? (lastEvent.data as ToolCallEvent).tool
      : (lastEvent.data as ToolResultEvent).tool
    : null;

  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm">
        {/* Strategy label */}
        {intent && (
          <div className="mb-2 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-semibold uppercase">
              {intent.strategy}
            </span>
            <span className="text-xs text-gray-400">
              {STRATEGY_LABELS[intent.strategy] || intent.reasoning}
            </span>
          </div>
        )}
        {/* Active connectors */}
        {intent && intent.connectors.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {intent.connectors.map((c) => (
              <span
                key={c}
                className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {events.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Calling tools...
            </div>
            <div className="space-y-1 font-mono text-xs">
              {events.map((evt, i) => {
                if (evt.type === "tool_call") {
                  const data = evt.data as ToolCallEvent;
                  return (
                    <div key={i} className="text-blue-600">
                      → {data.tool}
                      {data.connector && (
                        <span className="text-indigo-400 ml-1">
                          [{data.connector}]
                        </span>
                      )}
                    </div>
                  );
                }
                const data = evt.data as ToolResultEvent;
                return (
                  <div key={i} className="text-green-600">
                    ← {data.tool}
                    {data.connector && (
                      <span className="text-indigo-400 ml-1">
                        [{data.connector}]
                      </span>
                    )}{" "}
                    ✓
                  </div>
                );
              })}
            </div>
            {toolName && (
              <div className="mt-1 text-xs text-gray-400">
                {events.length} tool calls • Processing {toolName}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ChatViewProps {
  activeThread: ChatThread | null;
  onUpdateThread: (id: string, messages: ChatMessage[]) => void;
  chatState: {
    messages: ChatMessage[];
    stream: ChatStreamState;
    sendMessage: (text: string) => Promise<void>;
    reset: () => void;
  };
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
}

export function ChatView({
  activeThread,
  chatState,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: ChatViewProps) {
  const { messages, stream, sendMessage } = chatState;
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = stream.status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, stream.events.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || !activeThread) return;
    setInput("");
    sendMessage(text);
  };

  if (!activeThread) {
    return (
      <div className="flex h-full">
        {/* Threads panel */}
        <div className="w-56 bg-gray-900 border-r border-gray-800 shrink-0 overflow-y-auto">
          <ChatThreadsSidebar
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={onSelectThread}
            onNewThread={onNewThread}
            onDeleteThread={onDeleteThread}
          />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <div className="text-3xl mb-3">💬</div>
          <p className="text-sm font-medium text-gray-500">
            Select a thread or start a new chat
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Threads panel */}
      <div className="w-56 bg-gray-900 border-r border-gray-800 shrink-0 overflow-y-auto">
        <ChatThreadsSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onNewThread={onNewThread}
          onDeleteThread={onDeleteThread}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h1 className="text-sm font-semibold text-gray-900">
            AI Analyst Chat
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-3xl mb-3">💬</div>
            <p className="text-sm font-medium text-gray-500 mb-1">
              Ask about any deal in the pipeline
            </p>
            <p className="text-xs text-gray-400 mb-6">
              Click a suggestion or type your own question
            </p>

            <div className="max-w-lg w-full space-y-4">
              {/* Deal Lookup */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2 block">Deal Lookup</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Tell me about Helix Genomics",
                    "What is the status of the AeroCarbon deal?",
                    "Who is the lead partner on NovaPay?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comparison & Analysis */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2 block">Comparison & Analysis</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Compare the Healthcare sector deals",
                    "Which deals are in due diligence?",
                    "What are the highest valuation deals?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Relationships & Context */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-2 block">Relationships & Context</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Show investor relationships for Helix Genomics",
                    "What portfolio overlap exists in Climate sector?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="px-3 py-1.5 rounded-full border border-gray-300 text-xs text-gray-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {isStreaming && (
          <StreamingIndicator events={stream.events} intent={stream.intent} />
        )}

        {stream.status === "error" && stream.error && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {stream.error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-6 py-4 border-t border-gray-200 shrink-0"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder="Ask about a deal..."
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
