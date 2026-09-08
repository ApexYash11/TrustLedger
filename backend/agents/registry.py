"""Agent registry (issue #12) — maps domain strings to DiveAgent instances."""

from .base import DiveAgent
from .compliance_bot import ComplianceBot
from .research_agent import ResearchAgent


def _instances() -> list[DiveAgent]:
    return [ResearchAgent(), ComplianceBot()]


AGENT_REGISTRY: dict[str, DiveAgent] = {a.domain: a for a in _instances()}

#: Default agent used when a task has no registered agent for its domain.
DEFAULT_AGENT: DiveAgent = ResearchAgent()


def get_agent(domain: str) -> DiveAgent:
    return AGENT_REGISTRY.get(domain, DEFAULT_AGENT)