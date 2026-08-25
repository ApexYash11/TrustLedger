from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Agent
from ..schemas import AgentCreate, AgentCreated

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("", response_model=AgentCreated)
def register_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    agent = Agent(name=payload.name, version=payload.version, domain=payload.domain, description=payload.description)
    db.add(agent)
    db.commit()
    return {"agent_id": agent.agent_id}
