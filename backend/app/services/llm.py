"""OpenRouter LLM service — the real-model layer for TrustLedger research agents.

Uses the OpenAI-compatible OpenRouter API (https://openrouter.ai/api/v1).
If OPENROUTER_API_KEY is not set, all calls gracefully fall back to the
template agent so tests and offline demos keep working.

Streaming is via OpenRouter's `stream: true` SSE JSON lines — each chunk
contains `choices[0].delta.content`. Each token is forwarded as an SSE
`data: {"token": "..."}` frame so the frontend can render typing in real time.

Non-streaming `complete()` is used by the dispatcher runtime; `stream_complete()`
is used by the live /research/run-stream endpoint.
"""
import json
import os
import logging
from typing import AsyncIterator, Optional

import httpx

logger = logging.getLogger("trustledger.llm")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("TRUSTLEDGER_MODEL", "openai/gpt-4o-mini")
# Fast + cheap default; user can override via .env TRUSTLEDGER_MODEL
TIMEOUT_SECS = float(os.environ.get("TRUSTLEDGER_LLM_TIMEOUT", "60"))

SYSTEM_PROMPT = (
    "You are a Deloitte client-research analyst. You produce concise, defensible "
    "research recommendations. Given a research question and client context, you must:\n"
    "1) Identify the key evidence sources you would cite (market reports, filings, policy docs)\n"
    "2) Identify the Deloitte methodology clauses that govern the decision\n"
    "3) Walk through your reasoning step-by-step\n"
    "4) Produce a final outcome among: recommended, recommended_with_caveats, not_recommended, escalated\n"
    "5) Include confidence (0-1) and whether human review is required\n"
    "Reply STRICTLY as JSON with keys: primary_reason, supporting_factors (list), "
    "policy_basis (list), evidence_basis (list), exclusions_applied (list), "
    "outcome (one of the 4), outcome_summary (1-2 sentences), confidence_score, "
    "requires_human_review (bool), risk_level (low|medium|high), evidence_details (list of {title,source,content_summary,relevance}), "
    "policy_details (list of {policy_code,section,title,text_excerpt,application})."
)


def is_configured() -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY"))


def _headers() -> dict:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    # Optional but recommended by OpenRouter for ranking
    referer = os.environ.get("OPENROUTER_REFERER", "http://localhost:3000")
    title = os.environ.get("OPENROUTER_TITLE", "TrustLedger")
    if referer:
        headers["HTTP-Referer"] = referer
    if title:
        headers["X-Title"] = title
    return headers


def build_user_prompt(inputs: dict, case_type: str = "") -> str:
    client = inputs.get("client_name", "the client")
    question = inputs.get("research_question") or inputs.get("researchQuestion") or inputs.get("prompt") or client
    engagement = inputs.get("engagement_code", "")
    case = inputs.get("case_id", "")
    parts = [
        f"Client: {client}",
        f"Case type: {case_type}" if case_type else "",
        f"Engagement: {engagement}" if engagement else "",
        f"Case ID: {case}" if case else "",
        f"Research question: {question}",
        f"Additional context: {json.dumps(inputs, ensure_ascii=False)}" if len(inputs) > 2 else "",
    ]
    return "\n".join(p for p in parts if p)


async def complete(
    user_prompt: str,
    model: Optional[str] = None,
    temperature: float = 0.4,
) -> dict:
    """Non-streaming completion — returns parsed JSON. Falls back raises if not configured."""
    if not is_configured():
        raise RuntimeError("OPENROUTER_API_KEY not set")
    payload = {
        "model": model or DEFAULT_MODEL,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECS) as client:
        resp = await client.post(OPENROUTER_URL, headers=_headers(), json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        # Model already returns JSON string when response_format=json_object
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            logger.warning("LLM returned non-JSON: %r", content[:500])
            # Try to extract JSON blob
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                parsed = json.loads(content[start : end + 1])
            else:
                raise
        return parsed


async def stream_complete(
    user_prompt: str,
    model: Optional[str] = None,
    temperature: float = 0.4,
) -> AsyncIterator[str]:
    """Streaming completion — yields raw content tokens as they arrive."""
    if not is_configured():
        raise RuntimeError("OPENROUTER_API_KEY not set")
    payload = {
        "model": model or DEFAULT_MODEL,
        "temperature": temperature,
        "stream": True,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECS) as client:
        async with client.stream("POST", OPENROUTER_URL, headers=_headers(), json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                    delta = obj["choices"][0].get("delta", {})
                    token = delta.get("content")
                    if token:
                        yield token
                except Exception:
                    continue


def parse_llm_result(raw: dict, fallback_inputs: dict) -> dict:
    """Normalize raw LLM JSON into the AgentResult fields, with safe defaults."""
    outcome = raw.get("outcome") or "recommended_with_caveats"
    if outcome not in {"recommended", "recommended_with_caveats", "not_recommended", "escalated"}:
        outcome = "recommended_with_caveats"
    risk = raw.get("risk_level")
    if risk not in {"low", "medium", "high"}:
        risk = "medium"
    try:
        conf = float(raw.get("confidence_score", 0.82))
    except Exception:
        conf = 0.82
    conf = max(0.0, min(1.0, conf))
    return {
        "outcome": outcome,
        "outcome_summary": raw.get("outcome_summary") or raw.get("primary_reason") or "LLM research complete.",
        "structured_rationale": {
            "primary_reason": raw.get("primary_reason") or raw.get("outcome_summary") or "Analysis complete.",
            "supporting_factors": raw.get("supporting_factors") or [],
            "policy_basis": raw.get("policy_basis") or [],
            "evidence_basis": raw.get("evidence_basis") or [],
            "exclusions_applied": raw.get("exclusions_applied") or [],
        },
        "confidence_score": conf,
        "requires_human_review": bool(raw.get("requires_human_review", False)),
        "risk_level": risk,
        "evidence_details": raw.get("evidence_details") or [],
        "policy_details": raw.get("policy_details") or [],
    }
