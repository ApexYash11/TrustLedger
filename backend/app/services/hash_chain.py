import hashlib
import hmac

from .canonical_json import canonical_json

GENESIS = "GENESIS"


def compute_record_hash(record_snapshot: dict, previous_hash: str) -> str:
    payload = canonical_json(record_snapshot) + previous_hash
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def verify_record_hash(record_snapshot: dict, previous_hash: str, record_hash: str) -> bool:
    expected = compute_record_hash(record_snapshot, previous_hash)
    return hmac.compare_digest(expected, record_hash)
