from app.services.canonical_json import canonical_json
from app.services.hash_chain import GENESIS, compute_record_hash, verify_record_hash


def test_canonical_json_is_deterministic():
    a = canonical_json({"b": 1, "a": [2, {"z": 1, "y": 2}]})
    b = canonical_json({"a": [2, {"y": 2, "z": 1}], "b": 1})
    assert a == b
    assert " " not in a


def test_hash_is_sha256_hex():
    h = compute_record_hash({"x": 1}, GENESIS)
    assert len(h) == 64
    int(h, 16)  # valid hex


def test_same_input_same_hash_different_previous_different_hash():
    snapshot = {"case_id": "CLM-001", "amount": 100}
    h1 = compute_record_hash(snapshot, GENESIS)
    h1_again = compute_record_hash(snapshot, GENESIS)
    h2 = compute_record_hash(snapshot, "someotherhash")
    assert h1 == h1_again
    assert h1 != h2


def test_verify_pass_and_tamper_detection():
    snapshot = {"case_id": "CLM-001", "outcome": "approved"}
    record_hash = compute_record_hash(snapshot, GENESIS)
    assert verify_record_hash(snapshot, GENESIS, record_hash)

    tampered = {"case_id": "CLM-001", "outcome": "denied"}
    assert not verify_record_hash(tampered, GENESIS, record_hash)


def test_chain_linking():
    s0 = {"n": 0}
    s1 = {"n": 1}
    h0 = compute_record_hash(s0, GENESIS)
    h1 = compute_record_hash(s1, h0)
    assert verify_record_hash(s0, GENESIS, h0)
    assert verify_record_hash(s1, h0, h1)
    # linking to wrong previous hash fails
    assert not verify_record_hash(s1, h0[::-1], h1)
