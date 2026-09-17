"""PII redaction for research inputs.

TrustLedger's promise is "redacted while the decision logic stays auditable":
sensitive values inside a research question (email addresses, phone numbers,
card-like numbers) are replaced with a marker BEFORE the text reaches the model
and BEFORE it is sealed into the record, so neither the LLM nor the ledger ever
stores the raw value.

Scope is deliberately narrow — pattern redaction, not entity extraction. A real
deployment would pair this with a privacy pipeline; the point here is that the
sealed record proves what was *not* stored.
"""

import re

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Indian + international phone shapes: +91-98765 43210, (080) 4123 4567, etc.
_PHONE = re.compile(r"\+?\d[\d\s\-()]{7,}\d")
# 12-16 digit card / account number runs (spaces or dashes optional).
_CARD = re.compile(r"\b\d[-\s]?(?:\d[-\s]?){11,15}\d\b")

REDACT = "[REDACTED]"


def redact_pii(text: str) -> str:
    """Return ``text`` with emails, phone numbers and card-like runs redacted.

    Phone patterns are checked first so an email's domain never leaks through
    the number matcher.
    """
    if not text:
        return text
    out = _EMAIL.sub(REDACT, text)
    out = _PHONE.sub(REDACT, out)
    out = _CARD.sub(REDACT, out)
    return out


def redact_value(value):
    """Recursively redact strings inside JSON-shaped values (dicts and lists).

    Returns new containers — the original input is never mutated (review
    finding P2: inputs may be nested, and only top-level strings were covered).
    """
    if isinstance(value, str):
        return redact_pii(value)
    if isinstance(value, dict):
        return {k: redact_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(v) for v in value]
    return value


def redact_inputs(inputs: dict) -> dict:
    """Redact every string in a task's inputs, at any nesting depth."""
    return {key: redact_value(value) for key, value in inputs.items()}
