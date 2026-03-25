import { useCallback, useState } from "react";
import type { ChatMessage, ChatThread } from "../types/chat";

const STORAGE_KEY = "rialto_chat_threads";

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

export function useChatThreads() {
  const [threads, setThreads] = useState<ChatThread[]>(loadThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const persist = useCallback((next: ChatThread[]) => {
    setThreads(next);
    saveThreads(next);
  }, []);

  const createThread = useCallback(() => {
    const thread: ChatThread = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persist([thread, ...threads]);
    setActiveThreadId(thread.id);
    return thread.id;
  }, [threads, persist]);

  const deleteThread = useCallback(
    (id: string) => {
      const next = threads.filter((t) => t.id !== id);
      persist(next);
      if (activeThreadId === id) {
        setActiveThreadId(next.length > 0 ? next[0].id : null);
      }
    },
    [threads, activeThreadId, persist],
  );

  const updateThread = useCallback(
    (id: string, messages: ChatMessage[]) => {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "")
        : "New Chat";

      const next = threads.map((t) =>
        t.id === id ? { ...t, messages, title, updatedAt: Date.now() } : t,
      );
      persist(next);
    },
    [threads, persist],
  );

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  // Sort most recent first
  const sortedThreads = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  return {
    threads: sortedThreads,
    activeThreadId,
    activeThread,
    setActiveThread: setActiveThreadId,
    createThread,
    deleteThread,
    updateThread,
  };
}
