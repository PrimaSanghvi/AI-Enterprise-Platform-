import type { StreamEvent } from "./triage";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  toolsUsed?: string[];
  suggestions?: string[];
}

export interface ChatSource {
  title: string;
  deal_id: string;
}

export interface ChatResponseData {
  answer: string;
  tools_used: string[];
  sources: ChatSource[];
  strategy?: string;
  connectors?: string[];
  suggested_followups?: string[];
}

export interface IntentClassifiedEvent {
  strategy: string;
  connectors: string[];
  reasoning: string;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatStreamState {
  status: "idle" | "streaming" | "done" | "error";
  events: StreamEvent[];
  response: ChatResponseData | null;
  error: string | null;
  intent: IntentClassifiedEvent | null;
}
