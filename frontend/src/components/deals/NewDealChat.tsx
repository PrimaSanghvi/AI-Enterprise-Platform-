import { useRef, useState } from "react";
import { streamDealIntake, type DealIntakeMessage } from "../../api/deals";
import type { Deal } from "../../types/deal";

interface NewDealChatProps {
  onCreated: (deal: Deal) => void;
}

type Turn =
  | { role: "user" | "assistant"; content: string }
  | { role: "system"; content: string };

export function NewDealChat({ onCreated }: NewDealChatProps) {
  const [transcript, setTranscript] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "Hi — tell me about the deal you want to add. You can describe it freely (company, sector, stage, ask, valuation) and I'll fill in the gaps.",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<DealIntakeMessage[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");
    setTranscript((t) => [...t, { role: "user", content: text }]);
    setStreaming(true);

    let assistantReply = "";
    let createdDeal: Deal | null = null;

    try {
      await streamDealIntake(text, historyRef.current, (evt) => {
        if (evt.event === "question") {
          assistantReply = String((evt.data as { message?: string }).message ?? "");
        } else if (evt.event === "deal_created") {
          const data = evt.data as { deal?: Deal; message?: string };
          if (data.deal) createdDeal = data.deal;
          if (data.message) assistantReply = data.message;
        } else if (evt.event === "error") {
          assistantReply = `Error: ${(evt.data as { detail?: string }).detail ?? "unknown"}`;
        }
      });
    } catch (err) {
      setError((err as Error).message);
      setStreaming(false);
      return;
    }

    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: text },
      { role: "assistant", content: assistantReply },
    ];

    if (assistantReply) {
      setTranscript((t) => [...t, { role: "assistant", content: assistantReply }]);
    }
    setStreaming(false);

    if (createdDeal) {
      onCreated(createdDeal);
    }
  };

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {transcript.map((turn, i) => (
          <div
            key={i}
            className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                turn.role === "user"
                  ? "max-w-[80%] bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm"
                  : "max-w-[80%] bg-[var(--bg-card-alt)] text-[var(--text-primary)] px-3 py-2 rounded-lg text-sm border border-[var(--border-color)]"
              }
            >
              {turn.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Thinking...
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          placeholder="Describe the deal..."
          className="flex-1 px-4 py-2.5 border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-[var(--bg-card-alt)] disabled:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
