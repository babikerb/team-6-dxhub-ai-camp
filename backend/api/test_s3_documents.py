"""Unit tests for S3 document archival -- moto-mocked, no real AWS needed
(same convention as test_e2e.py's DynamoDB mocking)."""

import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "chatbot"))


@pytest.fixture()
def s3_bucket(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-west-2")
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-west-2")
        s3.create_bucket(
            Bucket="test-bucket",
            CreateBucketConfiguration={"LocationConstraint": "us-west-2"},
        )

        import s3_documents

        s3_documents._s3 = None  # force rebuild against the mocked client
        s3_documents._BUCKET = "test-bucket"
        yield s3


def test_privacy_policy_and_vpat_go_under_ati(s3_bucket):
    import s3_documents

    key = s3_documents.upload_document(
        "req-123", "privacy_policy", b"<html>hi</html>", "text/html", "https://vendor.com/privacy"
    )
    assert key == "DataStored/req-123/ATI/privacy_policy.html"

    key = s3_documents.upload_document(
        "req-123", "vpat", b"%PDF-1.4 fake", "application/pdf", "https://vendor.com/vpat.pdf"
    )
    assert key == "DataStored/req-123/ATI/vpat.pdf"


def test_hecvat_soc2_and_tos_go_under_itso(s3_bucket):
    import s3_documents

    for doc_type in ["hecvat", "soc2", "terms_of_service"]:
        key = s3_documents.upload_document(
            "req-123", doc_type, b"data", "text/html", f"https://vendor.com/{doc_type}"
        )
        assert key == f"DataStored/req-123/ITSO/{doc_type}.html"


def test_uploaded_content_is_retrievable(s3_bucket):
    import s3_documents

    key = s3_documents.upload_document(
        "req-123", "hecvat", b"the real bytes", "application/pdf", "https://vendor.com/hecvat.pdf"
    )
    obj = s3_bucket.get_object(Bucket="test-bucket", Key=key)
    assert obj["Body"].read() == b"the real bytes"


def test_returns_none_for_unmapped_doc_type(s3_bucket):
    import s3_documents

    result = s3_documents.upload_document(
        "req-123", "architecture_notes", b"data", "text/plain", "https://x.com"
    )
    assert result is None


def test_returns_none_when_no_bytes(s3_bucket):
    import s3_documents

    result = s3_documents.upload_document(
        "req-123", "vpat", b"", "application/pdf", "https://x.com/vpat.pdf"
    )
    assert result is None


def test_review_verdict_written_as_json_under_given_folder(s3_bucket):
    import s3_documents

    key = s3_documents.upload_review_verdict("req-123", "ITSO", {"risk_score": 7, "risk_tier": "High"})
    assert key == "DataStored/req-123/ITSO/review_verdict.json"
    obj = s3_bucket.get_object(Bucket="test-bucket", Key=key)
    body = json.loads(obj["Body"].read())
    assert body == {"risk_score": 7, "risk_tier": "High"}


def test_extension_prefers_content_type_over_url_suffix():
    import s3_documents

    assert s3_documents._extension_for("application/pdf", "https://vendor.com/page.html") == "pdf"


def test_extension_falls_back_to_url_suffix_when_content_type_missing():
    import s3_documents

    assert s3_documents._extension_for(None, "https://vendor.com/doc.pdf") == "pdf"
    assert s3_documents._extension_for("", "https://vendor.com/page") == "html"
