"""Unit tests for requester evidence upload helpers and handlers."""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))

# Force mock LLM mode BEFORE importing handlers — otherwise importing
# requester_docs pulls in ati/security generators under live Bedrock mode and
# later security_report tests hang on real network calls.
os.environ["CHATBOT_LLM_MODE"] = "mock"
os.environ.setdefault("REVIEW_DOCS_BUCKET", "test-bucket")
os.environ.setdefault("EMAILS_DISABLED", "true")

from handlers import evidence, emailer, requester_docs  # noqa: E402


def test_required_doc_types_from_flags():
    assert evidence.required_doc_types({"ati_flag": True}) == ["vpat", "privacy_policy"]
    assert evidence.required_doc_types({"security_flag": True}) == ["hecvat", "terms_of_service"]
    assert evidence.required_doc_types({"integration_flag": True}) == ["integration_document"]
    assert evidence.required_doc_types(
        {"ati_flag": True, "security_flag": True}
    ) == ["vpat", "privacy_policy", "hecvat", "terms_of_service"]


def test_missing_doc_types_respects_fulfilled_uploads():
    record = {
        "flags": {"ati_flag": True, "security_flag": True},
        "requester_documents": {
            "vpat": {"s3_key": "DataStored/x/ATI/vpat_a.pdf", "status": "uploaded"},
        },
    }
    missing = evidence.missing_doc_types(record)
    assert "vpat" not in missing
    assert "privacy_policy" in missing
    assert "hecvat" in missing


def test_evidence_filename_prefixes_doc_type():
    assert evidence.evidence_filename("vpat", "Report.PDF").startswith("vpat_")
    assert evidence.evidence_filename("vpat", "vpat_Report.PDF") == "vpat_Report.PDF"


def test_context_handler_hides_pii():
    record = {
        "request_id": "11111111-1111-1111-1111-111111111111",
        "status": "ITReview",
        "requestor": {
            "software_name": "Zoom",
            "requested_for_email": "secret@example.com",
            "requested_for_name": "Secret Person",
        },
        "flags": {"ati_flag": True},
        "requester_documents": {},
        "admin": {"admin_notes": "private"},
    }
    with patch.object(requester_docs.store, "get_request", return_value=record):
        resp = requester_docs.context_handler(
            {"pathParameters": {"id": record["request_id"]}}
        )
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["software_name"] == "Zoom"
    assert "secret@example.com" not in resp["body"]
    assert "Secret Person" not in resp["body"]
    assert "admin_notes" not in resp["body"]
    assert {d["doc_type"] for d in body["documents"]} == {"vpat", "privacy_policy"}


def test_upload_url_rejects_wrong_extension():
    record = {
        "request_id": "11111111-1111-1111-1111-111111111111",
        "flags": {"ati_flag": True},
        "requester_documents": {},
    }
    with patch.object(requester_docs.store, "get_request", return_value=record):
        resp = requester_docs.upload_url_handler({
            "pathParameters": {"id": record["request_id"]},
            "body": json.dumps({
                "doc_type": "vpat",
                "filename": "malware.exe",
                "content_type": "application/octet-stream",
            }),
        })
    assert resp["statusCode"] == 400
    assert "Unsupported file type" in resp["body"]


def test_upload_url_rejects_unrequired_doc_type():
    record = {
        "request_id": "11111111-1111-1111-1111-111111111111",
        "flags": {"ati_flag": True},
        "requester_documents": {},
    }
    with patch.object(requester_docs.store, "get_request", return_value=record):
        resp = requester_docs.upload_url_handler({
            "pathParameters": {"id": record["request_id"]},
            "body": json.dumps({
                "doc_type": "hecvat",
                "filename": "hecvat.pdf",
                "content_type": "application/pdf",
            }),
        })
    assert resp["statusCode"] == 400


def test_confirm_indexes_and_triggers_ati():
    request_id = "11111111-1111-1111-1111-111111111111"
    record = {
        "request_id": request_id,
        "flags": {"ati_flag": True},
        "requester_documents": {},
        "notifications": {},
        "review_docs": {},
    }
    s3 = MagicMock()
    s3.head_object.return_value = {
        "ContentLength": 1200,
        "ContentType": "application/pdf",
    }
    with (
        patch.object(requester_docs.store, "get_request", return_value=record),
        patch.object(requester_docs.store, "save_request") as save,
        patch.object(requester_docs, "_s3", return_value=s3),
        patch.object(requester_docs, "list_files", return_value=["vpat_doc.pdf"]),
        patch.object(requester_docs.ati_report, "invoke_worker_async") as ati,
        patch.object(requester_docs.security_report, "invoke_worker_async") as itso,
    ):
        resp = requester_docs.confirm_handler({
            "pathParameters": {"id": request_id},
            "body": json.dumps({
                "doc_type": "vpat",
                "filename": "vpat_doc.pdf",
                "content_type": "application/pdf",
            }),
        })
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["status"] == "uploaded"
    assert body["doc_type"] == "vpat"
    assert ati.called
    assert not itso.called
    assert save.called
    saved = save.call_args[0][0]
    assert "vpat" in saved["requester_documents"]
    assert saved["review_docs"]["ati"]["status"] == "complete"


def test_is_public_ip_blocks_loopback_and_private():
    assert requester_docs._is_public_ip("127.0.0.1") is False
    assert requester_docs._is_public_ip("10.0.0.1") is False
    assert requester_docs._is_public_ip("192.168.1.1") is False


def test_safe_fetch_rejects_non_http_scheme():
    raw, ctype, err = requester_docs._safe_fetch("file:///etc/passwd")
    assert raw is None
    assert "http" in (err or "").lower()


def test_missing_docs_email_idempotent_on_same_set():
    record = {
        "request_id": "11111111-1111-1111-1111-111111111111",
        "requestor": {
            "requested_for_name": "R",
            "requested_for_email": "r@example.com",
            "software_name": "Zoom",
        },
        "notifications": {},
    }
    assert emailer.send_missing_docs_email(record, missing_doc_types=["vpat", "hecvat"])
    assert not emailer.send_missing_docs_email(record, missing_doc_types=["vpat", "hecvat"])
    # Newly required type can trigger another email.
    assert emailer.send_missing_docs_email(record, missing_doc_types=["vpat", "hecvat", "privacy_policy"])
