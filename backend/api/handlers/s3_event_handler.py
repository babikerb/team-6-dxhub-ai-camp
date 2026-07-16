"""
Lambda handler triggered by S3 PutObject events in the DataStored/ prefix.

Expected S3 key structure:
    DataStored/<request_id>/<review_type>/<filename>

review_type must be one of: ATI, ITSO, Integration

When a file is uploaded, this handler:
1. Parses request_id and review_type from the S3 key.
2. Lists all current objects under DataStored/<request_id>/<review_type>/.
3. Updates the DynamoDB record's review_docs subtree with the current file list
   and marks the review type as having documents (status = "complete").

DynamoDB review_docs structure written:
    {
        "review_docs": {
            "ati":         {"status": "complete", "files": ["privacy_policy.pdf", ...]},
            "itso":        {"status": "complete", "files": ["hecvat.pdf", ...]},
            "integration": {"status": "complete", "files": ["architecture_notes.pdf", ...]}
        }
    }

A review type that has never had a file uploaded will NOT be touched by this
handler -- its initial state ("pending") is set by the GET /review-docs
endpoint when no data is stored yet.
"""

import logging
import os
import urllib.parse

import boto3
from botocore.exceptions import ClientError

from handlers.store import _get_table, now_iso

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_S3_BUCKET = os.environ.get("REVIEW_DOCS_BUCKET", "")

# Map the S3 folder name to the DynamoDB key used in review_docs.
_REVIEW_TYPE_MAP = {
    "ATI": "ati",
    "ITSO": "itso",
    "Integration": "integration",
}


def _s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))


def _list_files(s3, bucket: str, prefix: str) -> list[str]:
    """Return basenames of all objects under *prefix* (no sub-folders)."""
    paginator = s3.get_paginator("list_objects_v2")
    files = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            # Skip the folder placeholder itself (key ending with "/")
            if key.endswith("/"):
                continue
            # Extract just the filename (last segment)
            files.append(key.split("/")[-1])
    return files


def _update_review_docs(request_id: str, review_key: str, files: list[str]) -> None:
    """Update the review_docs.<review_key> subtree in DynamoDB."""
    table = _get_table()
    try:
        table.update_item(
            Key={"request_id": request_id},
            UpdateExpression=(
                "SET review_docs.#rk = :val, updated_at = :ts"
            ),
            ExpressionAttributeNames={"#rk": review_key},
            ExpressionAttributeValues={
                ":val": {"status": "complete", "files": files},
                ":ts": now_iso(),
            },
            ConditionExpression="attribute_exists(request_id)",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.warning(
                "request_id %s not found in DynamoDB — S3 event ignored", request_id
            )
        else:
            raise


def _ensure_review_docs_exists(request_id: str) -> None:
    """
    Ensure the review_docs attribute exists on the item before we try to set a
    nested key on it (DynamoDB will error if the top-level map is absent).
    Uses a conditional write so we never overwrite existing data.
    """
    table = _get_table()
    try:
        table.update_item(
            Key={"request_id": request_id},
            UpdateExpression="SET review_docs = :empty",
            ConditionExpression="attribute_not_exists(review_docs)",
            ExpressionAttributeValues={":empty": {}},
        )
    except ClientError as exc:
        # ConditionalCheckFailedException means review_docs already exists — fine.
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


def handler(event: dict, context=None) -> None:
    """
    Entry point for S3 event notifications.

    event shape (S3 → Lambda):
        {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "<bucket>"},
                        "object": {"key": "DataStored%2F<id>%2F<type>%2F<file>"}
                    }
                }
            ]
        }
    """
    s3 = _s3_client()

    for record in event.get("Records", []):
        s3_info = record.get("s3", {})
        bucket = s3_info.get("bucket", {}).get("name", _S3_BUCKET)
        raw_key = s3_info.get("object", {}).get("key", "")
        # S3 event keys are URL-encoded; decode them before parsing.
        key = urllib.parse.unquote_plus(raw_key)

        logger.info("Processing S3 event: bucket=%s key=%s", bucket, key)

        # Expected: DataStored/<request_id>/<review_type>/<filename>
        parts = key.split("/")
        if len(parts) < 4 or parts[0] != "DataStored":
            logger.warning("Unexpected key shape: %s — skipping", key)
            continue

        request_id = parts[1]
        raw_review_type = parts[2]

        review_key = _REVIEW_TYPE_MAP.get(raw_review_type)
        if review_key is None:
            logger.warning(
                "Unknown review type '%s' in key %s — skipping", raw_review_type, key
            )
            continue

        # List all files currently in this review folder.
        prefix = f"DataStored/{request_id}/{raw_review_type}/"
        files = _list_files(s3, bucket, prefix)
        logger.info(
            "Found %d file(s) for request %s / %s", len(files), request_id, raw_review_type
        )

        _ensure_review_docs_exists(request_id)
        _update_review_docs(request_id, review_key, files)
        logger.info("DynamoDB updated for request %s / %s", request_id, review_key)
