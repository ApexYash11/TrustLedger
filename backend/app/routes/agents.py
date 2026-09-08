from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent
from ..schemas import AgentCreate, AgentCreated, AgentListResponse, AgentOut

router = APIRouter(prefix="/agents", tags=["agents"])


def _find_agent(db: Session, name: str, domain: str):
    return db.query(Agent).filter(Agent.name == name, Agent.domain == domain).first()


@router.post("", response_model=AgentCreated)
def register_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    """Idempotent registration (issue #12): (name, domain) is the agent identity.

    A repeated POST returns the existing ``agent_id`` and reconciles its metadata
    (``version`` / ``description``) so ``GET /agents`` never reports an older
    version than the code the runtime actually dispatches. The composite unique
    constraint on ``(name, domain)`` backs this up: if two concurrent requests
    race past the lookup, the losing insert rolls back and returns the winner.
    """
    existing = _find_agent(db, payload.name, payload.domain)
    if existing is None:
        agent = Agent(
            name=payload.name,
            version=payload.version,
            domain=payload.domain,
            description=payload.description,
        )
        db.add(agent)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request registered the same (name, domain) first.
            db.rollback()
            winner = _find_agent(db, payload.name, payload.domain)
            if winner is None:  # pragma: no cover - only on an external race
                raise HTTPException(
                    status_code=409,
                    detail={"error": "Agent registration conflict", "code": "AGENT_CONFLICT"},
                )
            return {"agent_id": winner.agent_id}
        return {"agent_id": agent.agent_id}

    # Idempotent match: reconcile metadata instead of returning stale values.
    existing.version = payload.version
    if payload.description is not None:
        existing.description = payload.description
    try:
        db.commit()
    except IntegrityError:  # pragma: no cover - reconciliation cannot violate the constraint
        db.rollback()
    return {"agent_id": existing.agent_id}


@router.get("", response_model=AgentListResponse)
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).order_by(Agent.name).all()
    return {
        "agents": [
            AgentOut(
                agent_id=a.agent_id,
                name=a.name,
                version=a.version,
                domain=a.domain,
                description=a.description,
            )
            for a in agents
        ],
        "total": len(agents),
    }
