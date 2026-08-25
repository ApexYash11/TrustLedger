from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# --- Requests ---


class AgentCreate(BaseModel):
    name: str
    version: str
    domain: str
    description: Optional[str] = None


class DecisionStart(BaseModel):
    agent_id: str
    case_id: str
    case_type: str
    inputs: dict[str, Any]


class EventAppend(BaseModel):
    event_type: str
    summary: str
    actor: str = "agent"
    details: Optional[dict[str, Any]] = None


VALID_OUTCOMES = {"approved", "partially_approved", "denied", "escalated"}
RATIONALE_REQUIRED_FIELDS = (
    "primary_reason",
    "supporting_factors",
    "policy_basis",
    "evidence_basis",
    "exclusions_applied",
)


class DecisionComplete(BaseModel):
    outcome: str
    outcome_summary: str
    structured_rationale: dict[str, Any]
    alternatives_considered: Optional[list[dict[str, Any]]] = None
    confidence_score: Optional[float] = None
    requires_human_review: bool = False
    risk_level: Optional[str] = None

    @field_validator("outcome")
    @classmethod
    def validate_outcome(cls, v: str) -> str:
        if v not in VALID_OUTCOMES:
            raise ValueError(f"outcome must be one of {sorted(VALID_OUTCOMES)}")
        return v

    @field_validator("risk_level")
    @classmethod
    def validate_risk(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in {"low", "medium", "high"}:
            raise ValueError("risk_level must be low, medium, or high")
        return v

    @field_validator("structured_rationale")
    @classmethod
    def validate_rationale(cls, v: dict[str, Any]) -> dict[str, Any]:
        missing = [f for f in RATIONALE_REQUIRED_FIELDS if f not in v]
        if missing:
            raise ValueError(f"structured_rationale missing required fields: {missing}")
        return v


# --- Responses ---


class AgentCreated(BaseModel):
    agent_id: str


class DecisionStartResponse(BaseModel):
    task_id: str
    status: str
    created_at: str


class EventAppended(BaseModel):
    event_id: str
    sequence: int
    timestamp: str


class AuditRecordInfo(BaseModel):
    audit_id: str
    record_hash: str
    previous_hash: str
    chain_sequence: int
    sealed_at: str


class CompleteResponse(BaseModel):
    decision_id: str
    task_id: str
    status: str
    audit_record: AuditRecordInfo


class TaskSummary(BaseModel):
    task_id: str
    case_id: str
    case_type: str
    agent_name: str
    status: str
    risk_level: Optional[str] = None
    outcome: Optional[str] = None
    outcome_summary: Optional[str] = None
    duration_seconds: Optional[float] = None
    human_review_status: Optional[str] = None
    created_at: str


class DecisionList(BaseModel):
    decisions: list[TaskSummary]
    total: int


class EvidenceOut(BaseModel):
    evidence_id: str
    evidence_type: str
    title: str
    source: str
    content_summary: str
    relevance: Optional[str] = None
    retrieved_at: str


class PolicyRefOut(BaseModel):
    policy_id: str
    policy_code: str
    section: str
    title: str
    text_excerpt: str
    application: str


class EventOut(BaseModel):
    event_id: str
    sequence: int
    event_type: str
    timestamp: str
    summary: str
    details: Optional[dict[str, Any]] = None
    actor: str


class FullDecisionRecord(BaseModel):
    task: dict[str, Any]
    agent: dict[str, Any]
    events: list[EventOut]
    evidence: list[EvidenceOut]
    policy_references: list[PolicyRefOut]
    decision: Optional[dict[str, Any]] = None
    audit_record: Optional[AuditRecordInfo] = None


class ReplayStep(BaseModel):
    step: int
    timestamp: str
    title: str
    description: str
    evidence: list[dict[str, Any]] = []
    policies: list[dict[str, Any]] = []


class ReplayFinalDecision(BaseModel):
    outcome: str
    summary: str
    rationale: dict[str, Any]


class ReplayIntegrity(BaseModel):
    record_hash: Optional[str] = None
    verified: Optional[bool] = None


class ReplayResponse(BaseModel):
    task_id: str
    case_id: str
    replay_steps: list[ReplayStep]
    final_decision: Optional[ReplayFinalDecision] = None
    integrity: ReplayIntegrity


class VerifyResponse(BaseModel):
    task_id: str
    verified: bool
    record_hash: Optional[str] = None
    previous_hash: Optional[str] = None
    chain_sequence: Optional[int] = None
    sealed_at: Optional[str] = None
    chain_status: str
    message: str


class ChainVerifyResponse(BaseModel):
    total_records: int
    verified: bool
    broken_at_sequence: Optional[int] = None
    message: str


class ErrorResponse(BaseModel):
    error: str
    code: str = Field(default="ERROR")
