import type { PolicyRule, CreateRuleInput, SimulateInput, SimulateResult } from "../types/policy";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export async function fetchPolicyRules(
  role = "",
  connector = "",
): Promise<PolicyRule[]> {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (connector) params.set("connector", connector);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/policy/rules${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Failed to fetch policy rules: ${res.status}`);
  return res.json();
}

export async function createPolicyRule(
  rule: CreateRuleInput,
): Promise<PolicyRule> {
  const res = await fetch(`${API_BASE}/policy/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error(`Failed to create policy rule: ${res.status}`);
  return res.json();
}

export async function updatePolicyRule(
  id: string,
  updates: Partial<PolicyRule>,
): Promise<PolicyRule> {
  const res = await fetch(`${API_BASE}/policy/rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update policy rule: ${res.status}`);
  return res.json();
}

export async function deletePolicyRule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/policy/rules/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete policy rule: ${res.status}`);
}

export async function simulatePolicy(
  input: SimulateInput,
): Promise<SimulateResult> {
  const res = await fetch(`${API_BASE}/policy/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to simulate policy: ${res.status}`);
  return res.json();
}
