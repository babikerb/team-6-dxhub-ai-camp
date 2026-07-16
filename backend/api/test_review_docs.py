"""
Tests for handlers/get_review_docs.py

Covers:
- Returns 404 when request_id is missing from DynamoDB
- Returns 400 when no request_id path parameter is provided
- When review_docs is absent from DynamoDB item, all three types return status="pending"
- When a review_type has an empty files list, returns status="no_docs" with correct message
  - ATI and ITSO: "No documents found. Contact vendor"
  - Integration:  "No documents found"
- When a review_type has files, returns status="complete" with presigned URLs
- Presigned URLs are non-empty strings
- Response includes request_id at the top level
"""

import json

import boto3
import pytest
from moto import mock_aws


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-west-2")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "test")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "test")


@pytest.fixture()
def dynamo_table(aws_env):
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-west-2")
        table = dynamodb.create_table(
            TableName="SoftwareRequests",
            KeySchema=[{"AttributeName": "request_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "request_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        import handlers.store as store
        store._table = None
        yield table
        store._table = None


@pytest.fixture()
def s3_bucket(aws_env):
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-west-2")
        s3.create_bucket(
            Bucket="test-review-docs",
            CreateBucketConfiguration={"LocationConstraint": "us-west-2"},
        )
        yield s3


@pytest.fixture()
def full_env(dynamo_table, s3_bucket, monkeypatch):
    monkeypatch.setenv("REVIEW_DOCS_BUCKET", "test-review-docs")

    import handlers.get_review_docs as handler_mod
    import handlers.store as store

    s3_real = boto3.client("s3", region_name="us-west-2")
    monkeypatch.setattr(handler_mod, "_s3_client", lambda: s3_real)
    store._table = None

    yield dynamo_table, s3_bucket, handler_mod


# ── Helpers ───────────────────────────────────────────────────────────────────

REQUEST_ID = "review-req-001"
BUCKET = "test-review-docs"


def _event(request_id: str | None = REQUEST_ID) -> dict:
    return {"pathParameters": {"id": request_id} if request_id else {}}


def _put_request(table, request_id: str = REQUEST_ID, review_docs: dict | None = None):
    item = {"request_id": request_id, "status": "AdditionalReview"}
    if review_docs is not None:
        item["review_docs"] = review_docs
    table.put_item(Item=item)


def _upload(s3_client, key: str, body: bytes = b"data"):
    s3_client.put_object(Bucket=BUCKET, Key=key, Body=body)


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestGetReviewDocsErrors:
    def test_missing_request_id_returns_400(self, full_env):
        _, _, mod = full_env
        resp = mod.handler({"pathParameters": {}})
        assert resp["statusCode"] == 400
        body = json.loads(resp["body"])
        assert "error" in body

    def test_nonexistent_request_returns_404(self, full_env):
        _, _, mod = full_env
        resp = mod.handler(_event("does-not-exist"))
        assert resp["statusCode"] == 404
        body = json.loads(resp["body"])
        assert "error" in body


class TestGetReviewDocsPendingState:
    def test_no_review_docs_field_all_pending(self, full_env):
        """Item in DynamoDB has no review_docs key → all three types are pending."""
        table, _, mod = full_env
        _put_request(table)  # no review_docs

        resp = mod.handler(_event())
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])

        assert body["request_id"] == REQUEST_ID
        for key in ("ati", "itso", "integration"):
            section = body["review_docs"][key]
            assert section["status"] == "pending"
            assert section["files"] == []
            assert "Review in progress" in section["message"]

    def test_partial_review_docs_missing_key_is_pending(self, full_env):
        """If review_docs exists but a specific key is absent, that type is pending."""
        table, _, mod = full_env
        _put_request(table, review_docs={"itso": {"status": "complete", "files": ["soc2.pdf"]}})

        resp = mod.handler(_event())
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])

        assert body["review_docs"]["ati"]["status"] == "pending"
        assert body["review_docs"]["integration"]["status"] == "pending"


class TestGetReviewDocsNoDocsState:
    def test_ati_empty_files_returns_no_docs_with_contact_vendor(self, full_env):
        table, _, mod = full_env
        _put_request(table, review_docs={"ati": {"status": "complete", "files": []}})

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        ati = body["review_docs"]["ati"]
        assert ati["status"] == "no_docs"
        assert "Contact vendor" in ati["message"]

    def test_itso_empty_files_returns_no_docs_with_contact_vendor(self, full_env):
        table, _, mod = full_env
        _put_request(table, review_docs={"itso": {"status": "complete", "files": []}})

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        itso = body["review_docs"]["itso"]
        assert itso["status"] == "no_docs"
        assert "Contact vendor" in itso["message"]

    def test_integration_empty_files_returns_no_docs_without_contact_vendor(self, full_env):
        table, _, mod = full_env
        _put_request(table, review_docs={"integration": {"status": "complete", "files": []}})

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        intg = body["review_docs"]["integration"]
        assert intg["status"] == "no_docs"
        assert intg["message"] == "No documents found"
        assert "Contact vendor" not in intg["message"]


class TestGetReviewDocsCompleteState:
    def _seed_and_upload(self, full_env, key: str, review_docs: dict):
        table, s3, mod = full_env
        _put_request(table, review_docs=review_docs)
        _upload(s3, key)
        return table, s3, mod

    def test_ati_with_files_returns_complete_with_presigned_urls(self, full_env):
        s3_key = f"DataStored/{REQUEST_ID}/ATI/vpat.pdf"
        _, _, mod = self._seed_and_upload(
            full_env,
            s3_key,
            {"ati": {"status": "complete", "files": ["vpat.pdf"]}},
        )

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        ati = body["review_docs"]["ati"]
        assert ati["status"] == "complete"
        assert ati["message"] is None
        assert len(ati["files"]) == 1
        assert ati["files"][0]["name"] == "vpat.pdf"
        assert isinstance(ati["files"][0]["url"], str)
        assert len(ati["files"][0]["url"]) > 0

    def test_itso_with_multiple_files_returns_all_urls(self, full_env):
        table, s3, mod = full_env
        for fname in ("hecvat.pdf", "soc2.pdf", "terms_of_service.pdf"):
            _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/{fname}")
        _put_request(
            table,
            review_docs={
                "itso": {
                    "status": "complete",
                    "files": ["hecvat.pdf", "soc2.pdf", "terms_of_service.pdf"],
                }
            },
        )

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        itso = body["review_docs"]["itso"]
        assert itso["status"] == "complete"
        assert len(itso["files"]) == 3
        names = {f["name"] for f in itso["files"]}
        assert names == {"hecvat.pdf", "soc2.pdf", "terms_of_service.pdf"}
        for f in itso["files"]:
            assert f["url"] and len(f["url"]) > 0

    def test_integration_with_file_returns_complete(self, full_env):
        table, s3, mod = full_env
        _upload(s3, f"DataStored/{REQUEST_ID}/Integration/architecture_notes.pdf")
        _put_request(
            table,
            review_docs={
                "integration": {"status": "complete", "files": ["architecture_notes.pdf"]}
            },
        )

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        intg = body["review_docs"]["integration"]
        assert intg["status"] == "complete"
        assert intg["files"][0]["name"] == "architecture_notes.pdf"

    def test_mixed_states_all_three_types(self, full_env):
        """ATI=complete, ITSO=no_docs (empty files), Integration=pending (absent)."""
        table, s3, mod = full_env
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")
        _put_request(
            table,
            review_docs={
                "ati":  {"status": "complete", "files": ["vpat.pdf"]},
                "itso": {"status": "complete", "files": []},
                # integration key absent → pending
            },
        )

        resp = mod.handler(_event())
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])

        assert body["review_docs"]["ati"]["status"] == "complete"
        assert body["review_docs"]["itso"]["status"] == "no_docs"
        assert body["review_docs"]["integration"]["status"] == "pending"

    def test_response_includes_request_id(self, full_env):
        table, _, mod = full_env
        _put_request(table)

        resp = mod.handler(_event())
        body = json.loads(resp["body"])
        assert body["request_id"] == REQUEST_ID


class TestGetReviewDocsS3Fallback:
    """
    Cover the fallback path: review_docs key absent from DynamoDB but
    files already exist in S3 (e.g. uploaded before the event trigger
    was deployed).
    """

    def test_files_in_s3_but_absent_from_dynamo_returns_complete(self, full_env):
        """Primary fallback: S3 has files, DynamoDB has no entry → complete."""
        table, s3, mod = full_env
        _put_request(table)  # no review_docs key at all
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/privacy_policy.pdf")

        resp = mod.handler(_event())
        assert resp["statusCode"] == 200
        body = json.loads(resp["body"])

        ati = body["review_docs"]["ati"]
        assert ati["status"] == "complete"
        assert ati["message"] is None
        names = {f["name"] for f in ati["files"]}
        assert names == {"vpat.pdf", "privacy_policy.pdf"}
        for f in ati["files"]:
            assert f["url"] and len(f["url"]) > 0

    def test_s3_fallback_backfills_dynamodb(self, full_env):
        """After a fallback hit, DynamoDB is updated so the next call is served from DB."""
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/soc2.pdf")

        mod.handler(_event())

        # DynamoDB should now have the itso entry.
        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert "review_docs" in item
        itso = item["review_docs"]["itso"]
        assert itso["status"] == "complete"
        assert "soc2.pdf" in itso["files"]

    def test_no_files_in_s3_and_absent_from_dynamo_returns_pending(self, full_env):
        """Nothing in S3 either → genuinely pending."""
        table, _, mod = full_env
        _put_request(table)  # bucket is empty

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        # All three types should be pending.
        for key in ("ati", "itso", "integration"):
            assert body["review_docs"][key]["status"] == "pending"
            assert "Review in progress" in body["review_docs"][key]["message"]

    def test_partial_fallback_only_missing_keys_are_checked_in_s3(self, full_env):
        """
        If DynamoDB has an entry for ITSO but not ATI, only ATI should be
        looked up in S3; ITSO should be served directly from DynamoDB.
        """
        table, s3, mod = full_env
        _put_request(
            table,
            review_docs={"itso": {"status": "complete", "files": ["soc2.pdf"]}},
        )
        # Put ATI files in S3 — should trigger fallback for ATI only.
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/soc2.pdf")  # already in DB

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        assert body["review_docs"]["ati"]["status"] == "complete"
        assert body["review_docs"]["itso"]["status"] == "complete"
        assert body["review_docs"]["integration"]["status"] == "pending"

    def test_s3_fallback_for_all_three_review_types(self, full_env):
        """All three types absent from DynamoDB but present in S3."""
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/hecvat.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/Integration/architecture_notes.pdf")

        resp = mod.handler(_event())
        body = json.loads(resp["body"])

        assert body["review_docs"]["ati"]["status"] == "complete"
        assert body["review_docs"]["itso"]["status"] == "complete"
        assert body["review_docs"]["integration"]["status"] == "complete"
