"""Agent registry (issue #12) — maps domain strings to DiveAgent instances.

Dispatch is strict by design: :func:`get_agent` raises for any domain without a
registered implementation instead of silently falling back to a default agent.
A task queued against an unimplemented domain must never run under the wrong
agent identity (CodeRabbit finding on PR #21).
"""

from .base import DiveAgent
from .compliance_bot import ComplianceBot
from .research_agent import ResearchAgent


def _instances() -> list[DiveAgent]:
    return [ResearchAgent(), ComplianceBot()]


AGENT_REGISTRY: dict[str, DiveAgent] = {a.domain: a for a in _instances()}


def has_agent_implementation(domain: str) -> bool:
    """True when ``domain`` maps to a registered DiveAgent implementation."""
    return domain in AGENT_REGISTRY


def get_agent(domain: str) -> DiveAgent:
    """Return the DiveAgent registered for ``domain``.

    Raises:
        LookupError: if no implementation is registered for ``domain``.
    """
    agent = AGENT_REGISTRY.get(domain)
    if agent is None:
        raise LookupError(f"NO_AGENT_FOR_DOMAIN:{domain}")
    return agent