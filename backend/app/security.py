"""API-key authentication and principal identity for the audit trail.

Every request that mutates or reads the ledger is attributed to a *principal* —
the identity behind the key presented. That principal is what gets stamped on
decision events, so the audit trail records WHO acted, not merely what happened.

Configuration
-------------
``TRUSTLEDGER_API_KEYS``  comma-separated ``principal:key`` pairs, e.g.
                          ``compliance-analyst:k3y-...,claims-auditor:k3y-...``
``TRUSTLEDGER_API_KEY``   single key convenience form (principal ``api``).

When neither is set, authentication is **disabled** — local development and the
test suite keep working with zero configuration. Enforced mode is the default
for any deployed environment: set the keys and every API route requires them.
A present-but-malformed configuration raises at startup (fail closed); it never
falls back to open mode.

Production note
---------------
Browser-held keys are a demo convenience (the frontend sends the key; EventSource
cannot set headers, so the SSE route also accepts ``?key=``). In production the
token would come from a session established via a real identity provider.
"""

import hmac
import os
import re

from fastapi import Request
from starlette.responses import JSONResponse

#: Paths that never require a key.
PUBLIC_PATHS = ("/health", "/docs", "/openapi.json", "/redoc")

_KEY_RE = re.compile(r"^([A-Za-z0-9_.-]+):(.+)$")
_keys_cache: dict[str, str] | None = None


def load_keys() -> dict[str, str]:
    """Parse configured keys once, then cache (env does not change at runtime)."""
    global _keys_cache
    if _keys_cache is not None:
        return _keys_cache
    keys: dict[str, str] = {}
    raw = os.environ.get("TRUSTLEDGER_API_KEYS", "")
    if raw.strip():
        # A configured-but-unparseable key list must fail LOUD, never fall back
        # to an empty dict — an empty dict would silently disable auth while
        # the operator believes it is on (review finding P1).
        for part in raw.split(","):
            part = part.strip()
            m = _KEY_RE.match(part)
            if m and m.group(2):
                keys[m.group(1)] = m.group(2)
            else:
                raise RuntimeError(
                    "TRUSTLEDGER_API_KEYS contains a malformed entry "
                    f"({part!r}; expected 'principal:key', comma-separated). "
                    "Fix the configuration, or unset the variable entirely to "
                    "run in open development mode."
                )
    single = os.environ.get("TRUSTLEDGER_API_KEY", "").strip()
    if single:
        keys.setdefault("api", single)
    _keys_cache = keys
    return keys


def validate_auth_config() -> None:
    """Check the auth configuration at startup (fail closed).

    Open development mode applies only when no key configuration is present at
    all. A present-but-invalid configuration raises here so the app refuses to
    boot insecure rather than running with auth silently off.
    """
    load_keys()  # raises RuntimeError on malformed non-empty config


def auth_enabled() -> bool:
    return bool(load_keys())


def _token_of(request: Request) -> str | None:
    # EventSource cannot set headers, so the SSE route also accepts ?key=.
    if request.url.path == "/api/v1/decisions/stream":
        query_key = request.query_params.get("key")
        if query_key:
            return query_key
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def principal_of(request: Request) -> str | None:
    """Resolve the authenticated principal, or ``None`` when auth is disabled."""
    keys = load_keys()
    if not keys:
        return None
    token = _token_of(request)
    for name, key in keys.items():
        if token and hmac.compare_digest(token, key):
            return name
    return None


def _unauthorized(message: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=401, content={"error": message, "code": code})


def _forbidden(message: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=403, content={"error": message, "code": code})


async def auth_middleware(request: Request, call_next):
    """Attribute every API request to a principal; refuse anonymous callers.

    CORS is registered OUTSIDE this middleware (see main.py), so preflight
    OPTIONS requests are answered before authentication runs, and auth's own
    401/403 responses pass back through CORS with the right headers.
    """
    path = request.url.path
    # CORS is registered OUTSIDE auth (see main.py), so the CORS middleware
    # answers preflight OPTIONS before auth ever runs, and — critically —
    # auth's own 401/403 responses pass back through CORS and carry the
    # Access-Control-Allow-Origin header, so browsers surface the real auth
    # error instead of a generic network failure (review finding P2). The
    # OPTIONS skip here is a belt-and-braces backstop for the preflight path.
    if request.method == "OPTIONS" or not auth_enabled() or path in PUBLIC_PATHS or not path.startswith("/api/"):
        return await call_next(request)

    principal = principal_of(request)
    if principal is None:
        token = _token_of(request)
        if token is None:
            return _unauthorized(
                "An API key is required. Provide it as `Authorization: Bearer <key>`.",
                "AUTH_REQUIRED",
            )
        return _forbidden("The API key presented is not valid.", "AUTH_INVALID_KEY")

    # Hand the resolved identity downstream so routes never trust client input.
    request.state.principal = principal
    return await call_next(request)
