import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB

from .db import Base

# Real JSONB on PostgreSQL (indexing/query operators per docs/02); generic JSON on SQLite for tests.
JSONType = JSON().with_variant(JSONB, "postgresql")


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Agent(Base):
    __tablename__ = "agents"
    # (name, domain) is the stable agent identity (issue #12): the composite
    # unique constraint backs the idempotent registration race, so two concurrent
    # POSTs can never commit two different agent_ids for the same agent.
    __table_args__ = (UniqueConstraint("name", "domain", name="uq_agent_name_domain"),)

    agent_id = Column(String(36), primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False)
    version = Column(String(64), nullable=False)
    domain = Column(String(128), nullable=False)
    description = Column(String(1024), nullable=True)


class Task(Base):
    __tablename__ = "tasks"

    task_id = Column(String(36), primary_key=True, default=new_uuid)
    case_id = Column(String(64), nullable=False, index=True)
    case_type = Column(String(255), nullable=False)
    agent_id = Column(String(36), ForeignKey("agents.agent_id"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="running", index=True)
    risk_level = Column(String(16), nullable=True)
    inputs = Column(JSONType, nullable=False)
    human_review_status = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class DecisionEvent(Base):
    __tablename__ = "decision_events"
    __table_args__ = (UniqueConstraint("task_id", "sequence", name="uq_event_task_sequence"),)

    event_id = Column(String(36), primary_key=True, default=new_uuid)
    task_id = Column(String(36), ForeignKey("tasks.task_id"), nullable=False, index=True)
    sequence = Column(Integer, nullable=False)
    event_type = Column(String(64), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    summary = Column(String(1024), nullable=False)
    details = Column(JSONType, nullable=True)
    actor = Column(String(32), nullable=False, default="agent")


class Decision(Base):
    __tablename__ = "decisions"

    decision_id = Column(String(36), primary_key=True, default=new_uuid)
    task_id = Column(String(36), ForeignKey("tasks.task_id"), nullable=False, unique=True, index=True)
    outcome = Column(String(32), nullable=False)
    outcome_summary = Column(String(1024), nullable=False)
    structured_rationale = Column(JSONType, nullable=False)
    alternatives_considered = Column(JSONType, nullable=True)
    confidence_score = Column(Float, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=False)


class AuditRecord(Base):
    __tablename__ = "audit_records"
    __table_args__ = (UniqueConstraint("chain_sequence", name="uq_audit_chain_sequence"),)

    audit_id = Column(String(36), primary_key=True, default=new_uuid)
    task_id = Column(String(36), ForeignKey("tasks.task_id"), nullable=False, index=True)
    record_hash = Column(String(64), nullable=False)
    previous_hash = Column(String(64), nullable=False)
    record_snapshot = Column(JSONType, nullable=False)
    sealed_at = Column(DateTime(timezone=True), nullable=False)
    chain_sequence = Column(Integer, nullable=False)
