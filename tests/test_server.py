"""Tests for the localhost review server.

Covers the pure helpers (filename safety, date validation, path derivation),
the ReviewState append-only log (replay + last-write-wins), and full HTTP
round-trips against a live server bound to an ephemeral port — including the
path-traversal guard on static file serving.
"""

from __future__ import annotations

import json
import threading
from http.client import HTTPConnection
from pathlib import Path

import pytest

import server

DEMO_PKG = Path(server.__file__).resolve().parent / "examples" / "demo.review_pkg.json"


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("demo-rcc", "demo-rcc"),
        ("batch 2026/01", "batch_2026_01"),
        ("a.b_c-d", "a.b_c-d"),
        ("", "review"),  # empty -> fallback
        ("...", "review"),  # strips to empty -> fallback
        ("../etc/passwd", "etc_passwd"),  # path separators neutralized
    ],
)
def test_safe_name(raw, expected):
    assert server._safe_name(raw) == expected


@pytest.mark.parametrize("date", ["2026", "2026-02", "2026-02-14"])
def test_validate_review_accepts_well_formed_dates(date):
    review = {"edits": {"diagnosis_date": {"date": date, "precision": 3}}}
    assert server._validate_review(review) is None


def test_validate_review_allows_null_date():
    review = {"edits": {"diagnosis_date": {"date": None, "precision": 0}}}
    assert server._validate_review(review) is None


def test_validate_review_ignores_non_date_edits():
    review = {"edits": {"histology": "clear cell RCC", "grade": 2}}
    assert server._validate_review(review) is None


@pytest.mark.parametrize("bad", ["Feb 2026", "2026-2-1", "2026/02/14", "not-a-date"])
def test_validate_review_rejects_malformed_dates(bad):
    review = {"edits": {"diagnosis_date": {"date": bad}}}
    err = server._validate_review(review)
    assert err is not None
    assert "diagnosis_date" in err


@pytest.mark.parametrize(
    "name, expected",
    [
        ("batch.review_pkg.json", "batch.reviews.jsonl"),
        ("data.json", "data.reviews.jsonl"),
    ],
)
def test_default_reviews_path(name, expected):
    assert server.default_reviews_path(Path("d") / name).name == expected


# --------------------------------------------------------------------------- #
# ReviewState — the append-only verdict log
# --------------------------------------------------------------------------- #


def _state(tmp_path) -> server.ReviewState:
    return server.ReviewState({}, tmp_path / "out.reviews.jsonl", reviewer="dr-who")


def test_log_replay_is_last_write_wins(tmp_path):
    log = tmp_path / "out.reviews.jsonl"
    log.write_text(
        '{"event_key": "k1", "verdict": "approved"}\n'
        "\n"  # blank line ignored
        "{not valid json}\n"  # bad line ignored
        '{"event_key": "k1", "verdict": "rejected"}\n'  # later write wins
    )
    state = server.ReviewState({}, log, reviewer="")
    assert state.reviews["k1"]["verdict"] == "rejected"
    assert len(state.reviews) == 1


def test_save_review_appends_and_updates(tmp_path):
    state = _state(tmp_path)
    r1 = state.save_review({"event_key": "k1", "verdict": "approved"})
    r2 = state.save_review({"event_key": "k2", "verdict": "rejected"})
    assert r1["reviewed_count"] == 1
    assert r2["reviewed_count"] == 2
    lines = state.reviews_path.read_text().strip().splitlines()
    assert len(lines) == 2
    assert state.reviews["k2"]["verdict"] == "rejected"


def test_save_review_requires_event_key(tmp_path):
    with pytest.raises(ValueError, match="event_key"):
        _state(tmp_path).save_review({"verdict": "approved"})


def test_save_review_rejects_bad_date(tmp_path):
    with pytest.raises(ValueError, match="invalid date"):
        _state(tmp_path).save_review({"event_key": "k1", "edits": {"diagnosis_date": {"date": "Feb 2026"}}})


# --------------------------------------------------------------------------- #
# HTTP round-trips against a live server
# --------------------------------------------------------------------------- #


@pytest.fixture
def port(tmp_path, monkeypatch):
    """A running server on an ephemeral port with an isolated save dir."""
    monkeypatch.setattr(server, "SAVE_DIR", tmp_path / "reviews")
    monkeypatch.setattr(server, "STATE", None)
    monkeypatch.setattr(server, "DEFAULT_REVIEWER", "")
    httpd = server._open_server("127.0.0.1", 0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield httpd.server_address[1]
    finally:
        httpd.shutdown()
        httpd.server_close()


def _request(port, method, path, body=None):
    conn = HTTPConnection("127.0.0.1", port)
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    conn.request(method, path, body=data, headers=headers)
    resp = conn.getresponse()
    status, raw = resp.status, resp.read()
    conn.close()
    return status, raw


def test_serves_index_at_root(port):
    status, raw = _request(port, "GET", "/")
    assert status == 200
    assert b"<title>" in raw


def test_path_traversal_is_blocked(port):
    # A request that tries to escape web/ must be refused, not served.
    status, _ = _request(port, "GET", "/../server.py")
    assert status == 403


def test_unknown_static_path_404s(port):
    status, _ = _request(port, "GET", "/does-not-exist.js")
    assert status == 404


def test_api_data_reports_empty_before_load(port):
    status, raw = _request(port, "GET", "/api/data")
    assert status == 200
    assert json.loads(raw)["loaded"] is False


def test_load_then_review_roundtrip(port):
    package = json.loads(DEMO_PKG.read_text())
    status, raw = _request(port, "POST", "/api/load", package)
    assert status == 200
    loaded = json.loads(raw)
    assert loaded["loaded"] is True
    assert len(loaded["patients"]) == 2

    review = {"event_key": "DEMO-0001:N-1001:dx1", "verdict": "approved"}
    status, raw = _request(port, "POST", "/api/review", review)
    assert status == 200
    assert json.loads(raw)["ok"] is True

    # The verdict is now reflected in the data payload.
    _, raw = _request(port, "GET", "/api/data")
    assert "DEMO-0001:N-1001:dx1" in json.loads(raw)["reviews"]


def test_load_rejects_non_package(port):
    status, raw = _request(port, "POST", "/api/load", {"hello": "world"})
    assert status == 400
    assert json.loads(raw)["ok"] is False


def test_review_with_bad_date_is_rejected(port):
    _request(port, "POST", "/api/load", json.loads(DEMO_PKG.read_text()))
    review = {
        "event_key": "DEMO-0001:N-1001:dx1",
        "verdict": "approved",
        "edits": {"diagnosis_date": {"date": "Feb 2026"}},
    }
    status, raw = _request(port, "POST", "/api/review", review)
    assert status == 400
    assert "invalid date" in json.loads(raw)["error"]
