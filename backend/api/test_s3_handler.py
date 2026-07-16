"""
Tests for handlers/s3_event_handler.py

Covers:
- ATI file upload updates DynamoDB review_docs.ati
- ITSO file upload updates DynamoDB review_docs.itso
- Integration file upload updates DynamoDB review_docs.integration
- Multiple files in a prefix are all captured
- Unknown review type is skipped (no DynamoDB write)
- Malformed key (too few segments) is skipped
- Non-DataStored prefix is skipped
- Missing request_id (item not in DynamoDB) logs a warning and does not raise
- review_docs map is initialised if absent before writing a nested key
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
        store._table = None  # force rebuild against the mocked resource

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
    """Both DynamoDB and S3 mocked, bucket env var set."""
    monkeypatch.setenv("REVIEW_DOCS_BUCKET", "test-review-docs")

    import handlers.s3_event_handler as handler_mod
    import handlers.store as store

    # Force boto client rebuild inside the handler.
    # We patch _s3_client to return the already-mocked client.
    s3_real = boto3.client("s3", region_name="us-west-2")
    monkeypatch.setattr(handler_mod, "_s3_client", lambda: s3_real)
    store._table = None

    yield dynamo_table, s3_bucket, handler_mod


# ── Helpers ───────────────────────────────────────────────────────────────────

REQUEST_ID = "test-req-001"
BUCKET = "test-review-docs"


def _put_request(table, request_id: str = REQUEST_ID):
    """Insert a minimal request record into the mocked DynamoDB table."""
    table.put_item(Item={"request_id": request_id, "status": "AdditionalReview"})


def _upload(s3_client, key: str, body: bytes = b"data"):
    """Put a dummy object in the mocked S3 bucket."""
    s3_client.put_object(Bucket=BUCKET, Key=key, Body=body)


def _s3_event(key: str, bucket: str = BUCKET) -> dict:
    """Construct a minimal S3 PutObject event payload."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": bucket},
                    "object": {"key": key},
                }
            }
        ]
    }


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestS3HandlerHappyPath:
    def test_ati_upload_writes_ati_review_docs(self, full_env):
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/privacy_policy.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")

        mod.handler(_s3_event(f"DataStored/{REQUEST_ID}/ATI/vpat.pdf"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert "review_docs" in item
        ati = item["review_docs"]["ati"]
        assert ati["status"] == "complete"
        assert "privacy_policy.pdf" in ati["files"]
        assert "vpat.pdf" in ati["files"]

    def test_itso_upload_writes_itso_review_docs(self, full_env):
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/hecvat.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/soc2.pdf")

        mod.handler(_s3_event(f"DataStored/{REQUEST_ID}/ITSO/soc2.pdf"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        itso = item["review_docs"]["itso"]
        assert itso["status"] == "complete"
        assert "hecvat.pdf" in itso["files"]
        assert "soc2.pdf" in itso["files"]

    def test_integration_upload_writes_integration_review_docs(self, full_env):
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/Integration/architecture_notes.pdf")

        mod.handler(_s3_event(f"DataStored/{REQUEST_ID}/Integration/architecture_notes.pdf"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        intg = item["review_docs"]["integration"]
        assert intg["status"] == "complete"
        assert "architecture_notes.pdf" in intg["files"]

    def test_existing_review_docs_map_is_not_overwritten(self, full_env):
        """Writing ATI should not clobber an already-written ITSO entry."""
        table, s3, mod = full_env
        _put_request(table)
        # Pre-seed ITSO
        table.update_item(
            Key={"request_id": REQUEST_ID},
            UpdateExpression="SET review_docs = :v",
            ExpressionAttributeValues={":v": {"itso": {"status": "complete", "files": ["soc2.pdf"]}}},
        )
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")

        mod.handler(_s3_event(f"DataStored/{REQUEST_ID}/ATI/vpat.pdf"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        # ITSO entry should still be intact
        assert item["review_docs"]["itso"]["status"] == "complete"
        assert "soc2.pdf" in item["review_docs"]["itso"]["files"]
        # ATI entry should now exist too
        assert item["review_docs"]["ati"]["status"] == "complete"

    def test_multiple_records_in_event(self, full_env):
        """Handler processes all Records in a single S3 event."""
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/ATI/vpat.pdf")
        _upload(s3, f"DataStored/{REQUEST_ID}/ITSO/soc2.pdf")

        event = {
            "Records": [
                {"s3": {"bucket": {"name": BUCKET}, "object": {"key": f"DataStored/{REQUEST_ID}/ATI/vpat.pdf"}}},
                {"s3": {"bucket": {"name": BUCKET}, "object": {"key": f"DataStored/{REQUEST_ID}/ITSO/soc2.pdf"}}},
            ]
        }
        mod.handler(event)

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert item["review_docs"]["ati"]["status"] == "complete"
        assert item["review_docs"]["itso"]["status"] == "complete"


class TestS3HandlerEdgeCases:
    def test_unknown_review_type_is_skipped(self, full_env):
        """An unrecognised folder name (e.g. 'Unknown') must not crash or write."""
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"DataStored/{REQUEST_ID}/Unknown/file.pdf")

        mod.handler(_s3_event(f"DataStored/{REQUEST_ID}/Unknown/file.pdf"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert "review_docs" not in item  # nothing was written

    def test_malformed_key_too_few_segments(self, full_env):
        """A key with fewer than 4 path segments is silently skipped."""
        table, s3, mod = full_env
        _put_request(table)

        mod.handler(_s3_event("DataStored/only-two-parts"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert "review_docs" not in item

    def test_non_datastored_prefix_is_skipped(self, full_env):
        """Keys that don't start with 'DataStored' are ignored."""
        table, s3, mod = full_env
        _put_request(table)
        _upload(s3, f"OtherPrefix/{REQUEST_ID}/ATI/file.pdf")

        mod.handler(_s3_event(f"OtherPrefix/{REQUEST_ID}/ATI/file.pdf"))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert "review_docs" not in item

    def test_missing_request_id_does_not_raise(self, full_env):
        """If the request_id is not in DynamoDB the handler logs and continues."""
        table, s3, mod = full_env
        # Do NOT insert any request into DynamoDB.
        _upload(s3, "DataStored/nonexistent-id/ATI/vpat.pdf")

        # Should not raise.
        mod.handler(_s3_event("DataStored/nonexistent-id/ATI/vpat.pdf"))

    def test_url_encoded_key_is_decoded(self, full_env):
        """S3 event keys are URL-encoded; the handler must decode them."""
        table, s3, mod = full_env
        _put_request(table)
        raw_filename = "review verdict.pdf"  # space → %20 in S3 event key
        s3_key = f"DataStored/{REQUEST_ID}/ATI/{raw_filename}"
        _upload(s3, s3_key)

        encoded_key = f"DataStored/{REQUEST_ID}/ATI/review+verdict.pdf"
        mod.handler(_s3_event(encoded_key))

        item = table.get_item(Key={"request_id": REQUEST_ID})["Item"]
        assert "review_docs" in item
        ati = item["review_docs"]["ati"]
        assert ati["status"] == "complete"
        assert raw_filename in ati["files"]
