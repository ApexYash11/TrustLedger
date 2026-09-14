"""Graph-flavoured research dive agent with optional real LLM via OpenRouter.

When OPENROUTER_API_KEY is set, the agent calls OpenRouter to produce
grounded reasoning; otherwise it falls back to the deterministic template so
tests and offline demos keep working. All outputs are sealed into the
TrustLedger hash chain.

Knowledge-base companion: docs/12_Graph_Knowledge_System.md
"""
import logging
import os

from .base import AgentContext, AgentResult, DiveAgent, Step

logger = logging.getLogger("trustledger.research_agent")


class ResearchAgent(DiveAgent):
    name = "ResearchAgent"
    version = "1.3.0"
    domain = "deloitte_client_research"
    description = "Deloitte client research agent — market entry, vendor risk, regulatory scans."

    def _llm_enabled(self) -> bool:
        return bool(os.environ.get("OPENROUTER_API_KEY"))

    def build_steps(self, ctx: AgentContext, inputs: dict) -> list[Step]:
        client = inputs.get("client_name", "the client")
        question = inputs.get("research_question", inputs.get("prompt", "validate the research recommendation"))
        return [
            Step("data_retrieved", f"Engagement brief and client profile loaded for {client}"),
            Step(
                "policy_retrieved",
                "Research methodology DEL-RM-2026 loaded as graph policy node",
                details={"policy_reference": {
                    "policy_code": "DEL-RM-2026",
                    "section": "5.3",
                    "title": "Market Entry Evidence Thresholds",
                    "text_excerpt": "Requires three independent demand-side sources and a validated competitor cost baseline.",
                    "application": "Entry test applied while walking the knowledge graph.",
                }},
            ),
            Step(
                "clause_identified",
                "Graph edge applied_to linked: DEL-RM-2026 Sec 5.3 -> this engagement",
                details={"policy_reference": {
                    "policy_code": "GEO-CONF-2026",
                    "section": "B.2",
                    "title": "Geographic Market Definition",
                    "text_excerpt": "Define served market to sub-region level for mandate screening.",
                    "application": f"Scoped the graph walk to {client}'s served geography.",
                }},
            ),
            Step(
                "evidence_evaluated",
                f"Graph node evaluated: demand outlook supports the question ({question})",
                details={"evidence": {
                    "evidence_type": "third_party_report",
                    "title": "Sector Outlook 2026",
                    "source": "Licensed research provider",
                    "content_summary": "Moderate growth with downward revision risk on input costs.",
                    "relevance": "Primary demand-side source (graph edge: supports)",
                }},
            ),
            Step(
                "evidence_evaluated",
                "Graph node evaluated: client financial benchmark validates the cost baseline",
                details={"evidence": {
                    "evidence_type": "financial_report",
                    "title": "Client FY26 Financials",
                    "source": "Client-provided",
                    "content_summary": "Revenue and margin baseline consistent with mandate.",
                    "relevance": "Validates competitor cost baseline (graph edge: validates)",
                }},
            ),
            Step("decision_generated", "Graph walk complete: recommendation generated and rationale structured"),
        ]

    def _template_decide(self, inputs: dict) -> AgentResult:
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

    def decide(self, ctx: AgentContext, inputs: dict) -> AgentResult:
        # No key -> template immediately (keeps tests fast and offline-safe)
        if not self._llm_enabled():
            return self._template_decide(inputs)
        # Try LLM once; on any failure fall back to template
        try:
            import asyncio
            from app.services.llm import build_user_prompt, complete, parse_llm_result

            prompt = build_user_prompt(inputs, inputs.get("case_type", ""))
            raw = asyncio.run(complete(prompt))
            parsed = parse_llm_result(raw, inputs)
            return AgentResult(
                outcome=parsed["outcome"],
                outcome_summary=parsed["outcome_summary"],
                structured_rationale=parsed["structured_rationale"],
                confidence_score=parsed["confidence_score"],
                requires_human_review=parsed["requires_human_review"],
                risk_level=parsed["risk_level"],
            )
        except Exception as e:
            logger.warning("LLM decide failed, falling back to template: %s", e)
            return self._template_decide(inputs)

    def run(self, ctx: AgentContext, task_id: str, task_inputs: dict) -> AgentResult:
        """Stream steps then decide — with LLM result woven into evidence when available."""
        from app.services.decision_ops import append_event

        # Fast path: no LLM — use template steps
        if not self._llm_enabled():
            steps = self.build_steps(ctx, task_inputs)
            for s in steps:
                append_event(ctx.db, task_id=task_id, event_type=s.event_type, summary=s.summary, actor=s.actor, details=s.details)
            result = self._template_decide(task_inputs)
            result.steps = steps
            return result

        # LLM path: call LLM once, then build steps enriched with its output
        try:
            import asyncio
            from app.services.llm import build_user_prompt, complete, parse_llm_result

            prompt = build_user_prompt(task_inputs, task_inputs.get("case_type", ""))
            raw = asyncio.run(complete(prompt))
            parsed = parse_llm_result(raw, task_inputs)

            # Build enriched steps from LLM evidence/policy details
            client = task_inputs.get("client_name", "the client")
            steps: list[Step] = []
            steps.append(Step("data_retrieved", f"Engagement brief and client profile loaded for {client}"))

            policies = parsed.get("policy_details") or []
            if policies:
                for idx, p in enumerate(policies[:2]):
                    et = "policy_retrieved" if idx == 0 else "clause_identified"
                    steps.append(Step(et, f"Methodology {p.get('policy_code','DEL-RM-2026')} {p.get('section','')} — {p.get('title','')}", details={"policy_reference": p}))
            else:
                # fallback policy nodes
                steps.append(Step("policy_retrieved", "Research methodology DEL-RM-2026 loaded as graph policy node",
                    details={"policy_reference": {"policy_code": "DEL-RM-2026", "section": "5.3", "title": "Market Entry Evidence Thresholds",
                        "text_excerpt": "Requires three independent demand-side sources and a validated competitor cost baseline.",
                        "application": "Entry test applied while walking the knowledge graph."}}))
                steps.append(Step("clause_identified", "Graph edge applied_to linked: DEL-RM-2026 Sec 5.3 -> this engagement",
                    details={"policy_reference": {"policy_code": "GEO-CONF-2026", "section": "B.2", "title": "Geographic Market Definition",
                        "text_excerpt": "Define served market to sub-region level for mandate screening.",
                        "application": f"Scoped the graph walk to {client}'s served geography."}}))

            evidences = parsed.get("evidence_details") or []
            if evidences:
                for ev in evidences[:3]:
                    steps.append(Step("evidence_evaluated", f"Source evaluated: {ev.get('title','evidence')}", details={"evidence": ev}))
            else:
                # synthesize one evidence from outcome_summary
                steps.append(Step("evidence_evaluated", "Evidence synthesized from research question",
                    details={"evidence": {"evidence_type": "synthesis", "title": "Research Synthesis",
                        "source": "LLM analysis", "content_summary": parsed["outcome_summary"][:280], "relevance": "Primary synthesis"}}))

            steps.append(Step("decision_generated", "Recommendation generated and rationale structured"))

            for s in steps:
                append_event(ctx.db, task_id=task_id, event_type=s.event_type, summary=s.summary, actor=s.actor, details=s.details)

            return AgentResult(
                outcome=parsed["outcome"],
                outcome_summary=parsed["outcome_summary"],
                structured_rationale=parsed["structured_rationale"],
                confidence_score=parsed["confidence_score"],
                requires_human_review=parsed["requires_human_review"],
                risk_level=parsed["risk_level"],
                steps=steps,
            )
        except Exception as e:
            logger.warning("LLM run failed, falling back to template: %s", e)
            steps = self.build_steps(ctx, task_inputs)
            for s in steps:
                append_event(ctx.db, task_id=task_id, event_type=s.event_type, summary=s.summary, actor=s.actor, details=s.details)
            result = self._template_decide(task_inputs)
            result.steps = steps
            return result
