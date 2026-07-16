"""Unit tests for the Phase 1 security report generator -- mock mode only,
no network/AWS required (same convention as test_flags.py)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "chatbot"))

os.environ["CHATBOT_LLM_MODE"] = "mock"

import security_report_generator as srg  # noqa: E402


def _record(**it_review_overrides):
    return {
        "requestor": {
            "software_name": "Example Tool",
            "department": "IT Services",
            "vendor_website": "https://example.com",
        },
        "it_review": {
            "level_1_data": False,
            "level_2_data": False,
            "ai_capabilities": False,
            **it_review_overrides,
        },
        "flags": {"security_flag": True, "risk_level": "Low"},
    }


def test_level_1_data_scores_high():
    report = srg.generate_report(_record(level_1_data=True, level_1_categories=["PII"]))
    assert report["risk_score"] == 8
    assert report["risk_tier"] == "High"


def test_level_2_data_scores_medium():
    report = srg.generate_report(_record(level_2_data=True, level_2_categories=["FERPA"]))
    assert report["risk_score"] == 5
    assert report["risk_tier"] == "Medium"


def test_no_sensitive_data_scores_low():
    report = srg.generate_report(_record())
    assert report["risk_score"] == 2
    assert report["risk_tier"] == "Low"


def test_missing_hecvat_recommends_providing_one_first():
    report = srg.generate_report(_record())
    assert report["hecvat_provided"] is False
    assert report["recommendations"][0] == "Provide HECVAT before proceeding."


def test_ai_status_reflects_it_review():
    report = srg.generate_report(_record(ai_capabilities=True))
    assert report["ai_status"] == "yes"


def test_sources_list_covers_all_doc_types():
    report = srg.generate_report(_record())
    doc_types = {s["doc_type"] for s in report["sources"]}
    assert doc_types == {"privacy_policy", "terms_of_service", "vpat", "hecvat"}


def test_report_markdown_and_servicenow_comment_present():
    report = srg.generate_report(_record())
    assert "Example Tool" in report["report_markdown"]
    assert report["servicenow_comment"].startswith("Security risk review complete.")


def test_admin_attached_document_used_when_it_review_missing_url():
    record = _record()
    record["admin"] = {"attached_documents": {"hecvat": "https://vendor.example.com/hecvat.pdf"}}
    docs = srg._gather_documents(record)
    hecvat = next(d for d in docs if d["doc_type"] == "hecvat")
    assert hecvat["url"] == "https://vendor.example.com/hecvat.pdf"


def test_admin_attached_document_overrides_it_review_url():
    record = _record(vendor_privacy_policy_url="https://from-chat.example.com/privacy")
    record["admin"] = {
        "attached_documents": {"privacy_policy": "https://reviewer-corrected.example.com/privacy"}
    }
    docs = srg._gather_documents(record)
    privacy = next(d for d in docs if d["doc_type"] == "privacy_policy")
    assert privacy["url"] == "https://reviewer-corrected.example.com/privacy"


def test_soc2_only_included_when_attached():
    record = _record()
    docs = srg._gather_documents(record)
    assert not any(d["doc_type"] == "soc2" for d in docs)

    record["admin"] = {"attached_documents": {"soc2": "https://vendor.example.com/soc2.pdf"}}
    docs = srg._gather_documents(record)
    assert any(d["doc_type"] == "soc2" and d["url"] == "https://vendor.example.com/soc2.pdf" for d in docs)


def test_requester_upload_takes_priority_over_admin_attached(monkeypatch):
    monkeypatch.setattr(
        srg.s3_documents,
        "load_requester_evidence",
        lambda record, doc_types=None: {
            "hecvat": {
                "url": "s3://bucket/DataStored/x/ITSO/hecvat_uploaded.pdf",
                "source": "requester_upload",
                "text": "HECVAT CONTENTS",
                "raw_bytes": b"pdf",
                "content_type": "application/pdf",
            }
        },
    )
    record = _record()
    record["admin"] = {"attached_documents": {"hecvat": "https://vendor.example.com/hecvat.pdf"}}
    docs = srg._gather_documents(record)
    hecvat = next(d for d in docs if d["doc_type"] == "hecvat")
    assert hecvat["source"] == "requester_upload"
    assert hecvat["fetched"] is True
    assert "uploaded" in hecvat["url"]


# ---- Auto-search priority: upload > attached > requester_provided > auto_search ----
# These run with MODE forced off "mock" (via monkeypatch) so the auto-search branch
# actually executes, but find_document/_fetch_url are stubbed -- no real network.

def test_source_tag_is_admin_attached(monkeypatch):
    monkeypatch.setattr(srg, "MODE", "bedrock")
    monkeypatch.setattr(srg, "_fetch_url", lambda url: None)
    monkeypatch.setattr(srg.chatbot_parse, "find_document", lambda vendor, doc_type: {"found": False})
    record = _record()
    record["admin"] = {"attached_documents": {"vpat": "https://vendor.example.com/vpat.pdf"}}
    docs = srg._gather_documents(record)
    vpat = next(d for d in docs if d["doc_type"] == "vpat")
    assert vpat["source"] == "admin_attached"
    assert vpat["url"] == "https://vendor.example.com/vpat.pdf"


def test_source_tag_is_requester_provided_when_nothing_attached(monkeypatch):
    monkeypatch.setattr(srg, "MODE", "bedrock")
    monkeypatch.setattr(srg, "_fetch_url", lambda url: None)
    monkeypatch.setattr(srg.chatbot_parse, "find_document", lambda vendor, doc_type: {"found": False})
    record = _record(vendor_privacy_policy_url="https://from-chat.example.com/privacy")
    docs = srg._gather_documents(record)
    privacy = next(d for d in docs if d["doc_type"] == "privacy_policy")
    assert privacy["source"] == "requester_provided"


def test_auto_search_runs_when_nothing_known_and_finds_a_url(monkeypatch):
    monkeypatch.setattr(srg, "MODE", "bedrock")
    monkeypatch.setattr(srg, "_fetch_url", lambda url: None)
    monkeypatch.setattr(
        srg.chatbot_parse,
        "find_document",
        lambda vendor, doc_type: {"found": True, "url": f"https://vendor.example.com/{doc_type}"},
    )
    docs = srg._gather_documents(_record())
    for doc_type in ["privacy_policy", "terms_of_service", "vpat", "hecvat"]:
        d = next(x for x in docs if x["doc_type"] == doc_type)
        assert d["source"] == "auto_search"
        assert d["url"] == f"https://vendor.example.com/{doc_type}"


def test_auto_search_miss_is_tagged_not_found(monkeypatch):
    monkeypatch.setattr(srg, "MODE", "bedrock")
    monkeypatch.setattr(srg, "_fetch_url", lambda url: None)
    monkeypatch.setattr(
        srg.chatbot_parse, "find_document", lambda vendor, doc_type: {"found": False}
    )
    docs = srg._gather_documents(_record())
    for d in docs:
        assert d["source"] == "not_found"
        assert d["url"] is None
