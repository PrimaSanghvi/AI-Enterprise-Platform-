from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Flag(BaseModel):
    type: str
    severity: Literal["high", "medium", "low"]
    detail: str


class RecommendedAction(BaseModel):
    priority: int
    action: str
    owner: str


class ChatSource(BaseModel):
    title: str
    deal_id: str


class ChatResponse(BaseModel):
    answer: str
    tools_used: list[str]
    sources: list[ChatSource]
    strategy: str = ""
    connectors: list[str] = []
    suggested_followups: list[str] = []


class TriageOutput(BaseModel):
    deal_id: str
    recommendation: Literal["proceed", "pass", "monitor"]
    mandate_fit_score: int
    flags: list[Flag]
    recommended_actions: list[RecommendedAction]
    analyst_summary: str
    confidence: float
    connectors_used: list[str] = []
    strategy: str = "triage_workflow"
