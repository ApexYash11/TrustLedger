"""Research dive agent (issue #12) — performs a Deloitte client-research task live.

Unlike the old static replay script, this agent is dispatched by the runtime: it
claims a queued task, streams its work as ledger ``decision_event`` steps (so the
task's card animates on the Kanban), and seals a decision at the end.

Run standalone against a live API with::

    python -m agents.research_agent --case RES-2026-004821   # seed a fresh task live
"""
from .base import AgentContext, AgentResult, DiveAgent, Step


class ResearchAgent(DiveAgent):
    name = "ResearchAgent"
    version = "1.3.0"
    domain = "deloitte_client_research"
    description = "Deloitte client research agent — market entry, vendor risk, regulatory scans."

    def build_steps(self, ctx: AgentContext, inputs: dict) -> list[Step]:
        client = inputs.get("client_name", "the client")
        question = inputs.get("research_question", "validate the research recommendation")
        return [
            Step("data_retrieved", f"Client engagement brief and market data for {client} retrieved"),
            Step(
                "policy_retrieved",
                "Methodology DEL-RM-2026 loaded",
                details={"policy_reference": {
                    "policy_code": "DEL-RM-2026",
                    "section": "5.3",
                    "title": "Market Entry Evidence Thresholds",
                    "text_excerpt": "Requires three independent demand-side sources and a validated competitor cost baseline.",
                    "application": "Applied while testing the recommendation.",
                }},
            ),
            Step(
                "clause_identified",
                "Applicable standards identified",
                details={"policy_reference": {
                    "policy_code": "GEO-CONF-2026",
                    "section": "B.2",
                    "title": "Geographic Market Definition",
                    "text_excerpt": "Define served market to sub-region level for mandate screening.",
                    "application": f"Scoped to {client}'s served geography.",
                }},
            ),
            Step(
                "evidence_evaluated",
                f"Third-party outlook evaluated against: {question}",
                details={"evidence": {
                    "evidence_type": "third_party_report",
                    "title": "Sector Outlook 2026",
                    "source": "Licensed research provider",
                    "content_summary": "Moderate growth with downward revision risk on input costs.",
                    "relevance": "Primary demand-side source",
                }},
            ),
            Step(
                "evidence_evaluated",
                "Client financial benchmark reviewed",
                details={"evidence": {
                    "evidence_type": "financial_report",
                    "title": "Client FY26 Financials",
                    "source": "Client-provided",
                    "content_summary": "Revenue and margin baseline consistent with mandate.",
                    "relevance": "Validates competitor cost baseline",
                }},
            ),
            Step("decision_generated", "Recommendation generated and rationale structured"),
        ]

    def decide(self, ctx: AgentContext, inputs: dict) -> AgentResult:
        if inputs.get("escalate") or inputs.get("high_value"):
            return AgentResult(
                outcome="escalated",
                outcome_summary="High-value engagement flagged for partner review before issuance.",
                structured_rationale={
                    "primary_reason": "Conflicting findings on data residency require human sign-off.",
                    "supporting_factors": ["High engagement value", "Regulatory exposure"],
                    "policy_basis": ["DEL-RM-2026 5.3"],
                    "evidence_basis": ["Sector Outlook 2026"],
                    "exclusions_applied": [],
                },
                confidence_score=0.78,
                requires_human_review=True,
                risk_level="high",
            )
        return AgentResult(
            outcome="recommended_with_caveats",
            outcome_summary="Conditional recommendation: phased pilot entry; monitor input-cost revisions.",
            structured_rationale={
                "primary_reason": "Demand signals support entry with caveats on input-cost volatility.",
                "supporting_factors": ["Market growth", "Client readiness"],
                "policy_basis": ["DEL-RM-2026 5.3"],
                "evidence_basis": ["Sector Outlook 2026", "FY26 Financials"],
                "exclusions_applied": None,
            },
            confidence_score=0.85,
            risk_level="medium",
        )
