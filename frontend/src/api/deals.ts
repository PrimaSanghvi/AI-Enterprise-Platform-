import type { Deal } from "../types/deal";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export async function fetchDeals(): Promise<Deal[]> {
  const res = await fetch(`${API_BASE}/deals`);
  if (!res.ok) throw new Error(`Failed to fetch deals: ${res.status}`);
  return res.json();
}
