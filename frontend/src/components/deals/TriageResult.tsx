import type { TriageOutput } from "../../types/triage";

interface TriageResultProps {
  result: TriageOutput;
}

const recColors: Record<string, string> = {
  proceed: "bg-green-500 text-white",
  pass: "bg-red-500 text-white",
  monitor: "bg-yellow-500 text-white",
};

const severityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

export function TriageResult({ result }: TriageResultProps) {
  return (
    <div className="space-y-5">
      {/* Header: Recommendation + Scores */}
      <div className="flex items-center gap-4 flex-wrap">
        <span
          className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase ${
            recColors[result.recommendation] || "bg-gray-500 text-white"
          }`}
        >
          {result.recommendation}
        </span>
        {result.strategy && (
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
            {result.strategy === "triage_workflow"
              ? "Triage Workflow"
              : result.strategy}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Mandate Fit</span>
          <div className="flex items-center gap-1">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 rounded-full transition-all"
                style={{ width: `${(result.mandate_fit_score / 10) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {result.mandate_fit_score}/10
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Confidence</span>
          <span className="text-sm font-semibold text-gray-900">
            {Math.round(result.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Connectors Used */}
      {result.connectors_used && result.connectors_used.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Connectors Used
          </h4>
          <div className="flex flex-wrap gap-2">
            {result.connectors_used.map((c) => (
              <span
                key={c}
                className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Flags */}
      {result.flags.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Flags
          </h4>
          <div className="space-y-1.5">
            {result.flags.map((flag, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm ${
                  severityColors[flag.severity] || "bg-gray-50 text-gray-700"
                }`}
              >
                <span className="font-semibold shrink-0 uppercase text-xs mt-0.5">
                  {flag.severity}
                </span>
                <span>
                  <span className="font-medium">{flag.type}:</span> {flag.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {result.recommended_actions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Recommended Actions
          </h4>
          <div className="space-y-1.5">
            {result.recommended_actions
              .sort((a, b) => a.priority - b.priority)
              .map((action, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-md text-sm"
                >
                  <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {action.priority}
                  </span>
                  <div className="flex-1">
                    <span className="text-gray-900">{action.action}</span>
                    <span className="text-gray-400 ml-2">— {action.owner}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Analyst Summary */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Analyst Summary
        </h4>
        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-md p-4">
          {result.analyst_summary}
        </div>
      </div>
    </div>
  );
}
