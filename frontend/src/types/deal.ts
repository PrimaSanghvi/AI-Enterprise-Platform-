export interface TriageHistoryEntry {
  timestamp: string;
  analyst: string;
  decision: string;
  rationale: string;
}

export interface Deal {
  deal_id: string;
  company_id: string;
  company_name: string;
  sector: string;
  stage: string;
  status: string;
  source: string;
  date_received: string;
  ask_amount: number;
  valuation: number;
  lead_partner: string;
  triage_results: TriageHistoryEntry[];
  triage_status: string;
}
