from pydantic import BaseModel


class Company(BaseModel):
    company_id: str
    name: str
    sector: str
    stage: str
    description: str
    hq: str
    founded: int
    website: str


class TriageResult(BaseModel):
    timestamp: str
    analyst: str
    decision: str  # "pass", "advance", "hold"
    rationale: str


class Deal(BaseModel):
    deal_id: str
    company_id: str
    company_name: str
    sector: str
    stage: str
    status: str  # "screening", "due_diligence", "ic_review", "closed"
    source: str
    date_received: str
    ask_amount: float
    valuation: float
    lead_partner: str
    triage_results: list[TriageResult] = []
