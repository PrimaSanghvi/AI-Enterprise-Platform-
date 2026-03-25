import type { TriageStreamState } from "../../types/triage";
import { ToolCallLog } from "./ToolCallLog";
import { TriageResult } from "./TriageResult";

interface TriagePanelProps {
  state: TriageStreamState;
  dealId: string;
  onClose: () => void;
}

export function TriagePanel({ state, dealId, onClose }: TriagePanelProps) {
  if (state.status === "idle") return null;

  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Triage: {dealId}
          </h3>
          {state.status === "streaming" && (
            <span className="text-xs text-gray-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Analyzing...
            </span>
          )}
          {state.status === "done" && (
            <span className="text-xs text-green-600 font-medium">Complete</span>
          )}
          {state.status === "error" && (
            <span className="text-xs text-red-600 font-medium">Error</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="p-6 space-y-4 max-h-[calc(100vh-20rem)] overflow-y-auto">
        <ToolCallLog
          events={state.events}
          streaming={state.status === "streaming"}
        />

        {state.status === "error" && state.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
            {state.error.detail}
          </div>
        )}

        {state.status === "done" && state.result && (
          <TriageResult result={state.result} />
        )}
      </div>
    </div>
  );
}
