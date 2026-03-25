const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export async function streamTriage(
  dealId: string,
  onEvent: (evt: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/triage/${dealId}`, {
    method: "POST",
    signal,
  });

  if (!res.ok) {
    throw new Error(`Triage request failed: ${res.status}`);
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
          onEvent({
            event: eventMatch[1],
            data: JSON.parse(dataMatch[1]),
          });
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
