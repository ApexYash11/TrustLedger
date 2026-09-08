"""Compliance dive agent (issue #12) — a second agent for multi-agent demo readiness.

Runs routine regulatory/lending-norm scans that rarely need human review, giving
the dispatcher two distinct agents to prove concurrent cards from the runtime.
"""
from .base import AgentContext, AgentResult, DiveAgent, Step


class ComplianceBot(DiveAgent):
    name = "ComplianceBot"
    version = "1.0.1"
    domain = "regulatory_compliance"
    description = "Automated compliance and regulatory scan bot."

    def build_steps(self, ctx: AgentContext, inputs: dict) -> list[Step]:
        client = inputs.get("client_name", "the client")
        return [
            Step("data_retrieved", f"Regulatory text set and mandate scope for {client} retrieved"),
            Step(
                "clause_identified",
                "Applicable regulation cross-referenced",
                details={"policy_reference": {
                    "policy_code": "DPDP-2026",
                    "section": "S.12",
                    "title": "Consent & Data Minimality",
                    "text_excerpt": "Collection must be limited to purpose, purpose must be explicit.",
                    "application": "Checked the engagement's data flows.",
                }},
            ),
            Step(
                "evidence_evaluated",
                "Compliance checklist verified",
                details={"evidence": {
                    "evidence_type": "compliance_checklist",
                    "title": "Client Compliance Checklist FY26",
                    "source": "Client attestation",
                    "content_summary": "All mandatory controls attested.",
                    "relevance": "Primary compliance source",
                }},
            ),
            Step("decision_generated", "Compliance opinion generated"),
        ]

    def decide(self, ctx: AgentContext, inputs: dict) -> AgentResult:
        if inputs.get("concerning"):
            return AgentResult(
                outcome="not_recommended",
                outcome_summary="Compliance gap found: consent flow does not satisfy DPDP minimality.",
                structured_rationale={
                    "primary_reason": "Consent flow collects more data than the stated purpose.",
                    "supporting_factors": ["No legal basis for secondary use"],
                    "policy_basis": ["DPDP-2026 S.12"],
                    "evidence_basis": ["Compliance checklist FY26"],
                    "exclusions_applied": [],
                },
                confidence_score=0.9,
                requires_human_review=True,
                risk_level="high",
            )
        return AgentResult(
            outcome="recommended",
            outcome_summary="Compliance posture aligns with applicable regulations; no block found.",
            structured_rationale={
                "primary_reason": "All mandatory controls attested, no material divergence.",
                "supporting_factors": ["Controls attested", "No open findings"],
                "policy_basis": ["DPDP-2026 S.12"],
                "evidence_basis": ["Compliance checklist FY26"],
                "exclusions_applied": None,
            },
            confidence_score=0.92,
            risk_level="low",
        )