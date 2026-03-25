from pydantic import BaseModel


class PortfolioOverlapEntry(BaseModel):
    company_name: str
    sector: str
    overlap_type: str  # "customer_overlap", "market_overlap", "talent_overlap"
    overlap_score: float
    details: str
