from pydantic import BaseModel


class DealFile(BaseModel):
    file_id: str
    deal_id: str
    filename: str
    file_type: str  # "pitch_deck", "financials", "legal", "memo"
    size_kb: int
    uploaded_at: str
    url: str


class DocumentChunk(BaseModel):
    chunk_id: str
    deal_id: str
    sector: str
    source_file: str
    text: str
    metadata: dict
