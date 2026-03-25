import { useState, useEffect, useCallback } from "react";
import { fetchRAGStats, type RAGStats } from "../api/rag";

export function useRAGStats(pollInterval = 10000) {
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchRAGStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollInterval);
    return () => clearInterval(interval);
  }, [refresh, pollInterval]);

  return { stats, loading, error, refresh };
}
