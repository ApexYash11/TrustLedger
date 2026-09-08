from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent
from ..schemas import AgentCreate, AgentCreated, AgentListResponse, AgentOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("", response_model=AgentCreated)
def register_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    # Idempotent registration (issue #12): look up by (name, domain) first so the
    # agent identity stays stable across runs instead of duplicating rows.
    existing = (
        db.query(Agent)
        .filter(Agent.name == payload.name, Agent.domain == payload.domain)
        .first()
    )
    if existing:
        return {"agent_id": existing.agent_id}
    agent = Agent(name=payload.name, version=payload.version, domain=payload.domain, description=payload.description)
    db.add(agent)
    db.commit()
    return {"agent_id": agent.agent_id}


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
