export type Operation = "Read" | "Search" | "Write" | "Action";

export interface PolicyRule {
  id: string;
  role: string;
  connector: string;
  operations: Operation[];
  fieldRestrictions: string[];
  rowFilters: Record<string, string[]>;
  enabled: boolean;
  description: string;
  createdAt: string;
}

export interface CreateRuleInput {
  role: string;
  connector: string;
  operations: Operation[];
  fieldRestrictions: string[];
  rowFilters: Record<string, string[]>;
  description: string;
  enabled: boolean;
}

export interface SimulateInput {
  role: string;
  connector: string;
  operation: string;
  fields?: string[];
}

export interface SimulateResult {
  decision: "Allow" | "Deny";
  matchedRuleId: string | null;
  maskedFields: string[];
  rowFilters: Record<string, string[]>;
  reasoning: { step: number; check: string; result: string }[];
}
