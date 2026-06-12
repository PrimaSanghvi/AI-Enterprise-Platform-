import type { Deal, NewDealInput, UploadDealResponse } from "../types/deal";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

export async function fetchDeals(): Promise<Deal[]> {
  const res = await fetch(`${API_BASE}/deals`);
  if (!res.ok) throw new Error(`Failed to fetch deals: ${res.status}`);
  return res.json();
}

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface CreateDealFailure {
  ok: false;
  status: number;
  error: string;
  detail?: unknown;
}

export interface CreateDealSuccess {
  ok: true;
  deal: Deal;
  warnings?: string[];
}

export type CreateDealResult = CreateDealSuccess | CreateDealFailure;

export async function createDeal(payload: NewDealInput): Promise<CreateDealResult> {
  const res = await fetch(`${API_BASE}/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, error: body.error || "Request failed", detail: body.detail };
  }
  return { ok: true, deal: body as Deal };
}

export async function uploadDeal(file: File): Promise<CreateDealResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/deals/upload`, { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, error: body.error || "Upload failed", detail: body.detail };
  }
  const data = body as UploadDealResponse;
  return { ok: true, deal: data.deal, warnings: data.warnings };
}

export interface DealIntakeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamDealIntake(
  message: string,
  conversationHistory: DealIntakeMessage[],
  onEvent: (evt: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/deals/from-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_history: conversationHistory }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Deal intake request failed: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop()!;

    for (const part of parts) {
      const eventMatch = part.match(/^event:\s*(.+)$/m);
      const dataMatch = part.match(/^data:\s*(.+)$/m);
      if (eventMatch && dataMatch) {
        try {
          onEvent({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) });
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
