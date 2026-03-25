from pydantic import BaseModel


class Relationship(BaseModel):
    entity_id: str
    name: str
    type: str  # "investor", "board_member", "competitor", "partner"
    details: str


class CompanyRelationships(BaseModel):
    company_id: str
    company_name: str
    relationships: list[Relationship]
