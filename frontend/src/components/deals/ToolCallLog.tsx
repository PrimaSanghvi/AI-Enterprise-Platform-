import { useEffect, useRef } from "react";
import type { StreamEvent, ToolCallEvent, ToolResultEvent } from "../../types/triage";

interface ToolCallLogProps {
  events: StreamEvent[];
  streaming: boolean;
}

export function ToolCallLog({ events, streaming }: ToolCallLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (events.length === 0 && !streaming) return null;

  return (
    <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Tool Calls
        </span>
        {streaming && (
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        )}
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-2 font-mono text-xs">
        {events.map((evt, i) => {
          if (evt.type === "tool_call") {
            const data = evt.data as ToolCallEvent;
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0">→</span>
                <span className="text-[var(--text-primary)]">
                  <span className="text-blue-300 font-semibold">{data.tool}</span>
                  {data.connector && (
                    <span className="text-indigo-400 ml-1">[{data.connector}]</span>
                  )}
                  <span className="text-[var(--text-secondary)]">
                    ({JSON.stringify(data.input)})
                  </span>
                </span>
              </div>
            );
          }
          const data = evt.data as ToolResultEvent;
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">←</span>
              <span className="text-[var(--text-muted)] break-all">
                <span className="text-green-300 font-semibold">{data.tool}</span>
                {data.connector && (
                  <span className="text-indigo-400 ml-1">[{data.connector}]</span>
                )}{" "}
                {data.result_preview.slice(0, 120)}...
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
