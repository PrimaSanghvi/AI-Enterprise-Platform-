import { useCallback, useEffect, useState } from "react";
import { fetchDeals } from "../api/deals";
import type { Deal } from "../types/deal";

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDeals();
      setDeals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { deals, loading, error, refetch: load };
}
