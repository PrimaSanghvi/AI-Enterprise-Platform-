export interface Flag {
  type: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

export interface RecommendedAction {
  priority: number;
  action: string;
  owner: string;
}

export interface TriageOutput {
  deal_id: string;
  recommendation: "proceed" | "pass" | "monitor";
  mandate_fit_score: number;
  flags: Flag[];
  recommended_actions: RecommendedAction[];
  analyst_summary: string;
  confidence: number;
  connectors_used: string[];
  strategy?: string;
}

export interface ToolCallEvent {
  tool: string;
  connector?: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  tool: string;
  connector?: string;
  result_preview: string;
}

export interface TriageErrorEvent {
  detail: string;
  raw_text: string;
}

export interface StreamEvent {
  type: "tool_call" | "tool_result";
  data: ToolCallEvent | ToolResultEvent;
}

export interface TriageStreamState {
  status: "idle" | "streaming" | "done" | "error";
  events: StreamEvent[];
  result: TriageOutput | null;
  error: TriageErrorEvent | null;
}
