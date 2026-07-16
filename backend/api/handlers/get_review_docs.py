"""
GET /requests/{id}/review-docs

Returns the review documents for a request, grouped by review type (ati, itso,
integration). For each type that has documents, a short-lived presigned S3 URL
is generated per file so the admin can download directly from the browser.

Response shape:
{
    "request_id": "<uuid>",
    "review_docs": {
        "ati": {
            "status": "pending" | "complete" | "no_docs",
            "message": "<human-readable string>",
            "files": [
                {"name": "privacy_policy.pdf", "url": "https://...presigned..."}
            ]
        },
        "itso":        { ... },
        "integration": { ... }
    }
}

Status semantics:
- "pending"  — no DynamoDB entry AND no files found in S3 (review not started).
               Message: "Review in progress, gathering documents"
- "complete" — files present; presigned URLs are returned.
               Message: None (frontend shows the file links directly)
- "no_docs"  — DynamoDB entry exists but files list is empty.
               ATI / ITSO: "No documents found. Contact vendor"
               Integration: "No documents found"

S3 fallback:
    When a review type's key is absent from DynamoDB, this handler lists
    S3 directly under DataStored/<request_id>/<ReviewFolder>/.  If files
    are found there, they are written back to DynamoDB (backfill) so future
    calls are fast, and the response reflects the real state rather than
    showing "pending" for documents that already exist.

    This covers files that were uploaded before the S3 event trigger was
    deployed, or uploaded by any path that bypassed the trigger.
"""

import logging
import os

import boto3
from botocore.exceptions import ClientError

from .s3_event_handler import (
    _ensure_review_docs_exists,
    _update_review_docs,
    list_files,
)
from .store import error_response, get_request, response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_S3_BUCKET = os.environ.get("REVIEW_DOCS_BUCKET", "")
_PRESIGN_EXPIRY = int(os.environ.get("PRESIGN_EXPIRY_SECONDS", "3600"))  # 1 hour

# Per-review-type messaging when there are no documents.
_NO_DOCS_MESSAGES = {
    "ati":         "No documents found. Contact vendor",
    "itso":        "No documents found. Contact vendor",
    "integration": "No documents found",
}

_PENDING_MESSAGE = "Review in progress, gathering documents"

# Map DynamoDB key → S3 folder name (for building object keys and S3 listing).
_REVIEW_TYPE_S3_FOLDER = {
    "ati":         "ATI",
    "itso":        "ITSO",
    "integration": "Integration",
}


def _s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))


def _presign(s3_client, bucket: str, key: str, expiry: int) -> str:
    """Generate a presigned GET URL for the given S3 object."""
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expiry,
    )


def _build_file_entries(s3_client, request_id: str, review_key: str, files: list[str], bucket: str) -> list[dict]:
    """Build the list of {name, url} dicts for a set of filenames."""
    s3_folder = _REVIEW_TYPE_S3_FOLDER[review_key]
    entries = []
    for filename in files:
        s3_key = f"DataStored/{request_id}/{s3_folder}/{filename}"
        try:
            url = _presign(s3_client, bucket, s3_key, _PRESIGN_EXPIRY)
        except ClientError:
            url = None
        entries.append({"name": filename, "url": url})
    return entries


def _build_review_section(
    s3_client,
    request_id: str,
    review_key: str,
    stored: dict | None,
    bucket: str,
) -> dict:
    """
    Build the response object for one review type.

    *stored* is the value of review_docs[review_key] from DynamoDB, or None
    if that key is absent.

    When *stored* is None the handler falls back to listing S3 directly.
    If files exist in S3, it backfills DynamoDB and returns complete status.
    If no files exist in S3 either, it returns pending.
    """
    # ── DynamoDB entry present ────────────────────────────────────────────────
    if stored is not None:
        files = stored.get("files", [])
        if not files:
            return {
                "status": "no_docs",
                "message": _NO_DOCS_MESSAGES[review_key],
                "files": [],
            }
        return {
            "status": "complete",
            "message": None,
            "files": _build_file_entries(s3_client, request_id, review_key, files, bucket),
        }

    # ── DynamoDB entry absent — fall back to S3 listing ───────────────────────
    s3_folder = _REVIEW_TYPE_S3_FOLDER[review_key]
    prefix = f"DataStored/{request_id}/{s3_folder}/"
    try:
        files = list_files(s3_client, bucket, prefix)
    except ClientError as exc:
        logger.warning(
            "S3 fallback listing failed for %s/%s: %s", request_id, review_key, exc
        )
        files = []

    if not files:
        # Nothing in S3 either — genuinely pending.
        return {
            "status": "pending",
            "message": _PENDING_MESSAGE,
            "files": [],
        }

    # Files exist in S3 but weren't recorded in DynamoDB — backfill.
    logger.info(
        "S3 fallback: found %d file(s) for %s/%s — backfilling DynamoDB",
        len(files), request_id, review_key,
    )
    try:
        _ensure_review_docs_exists(request_id)
        _update_review_docs(request_id, review_key, files)
    except ClientError as exc:
        # Backfill is best-effort; a failure here should not block the response.
        logger.warning("DynamoDB backfill failed for %s/%s: %s", request_id, review_key, exc)

    return {
        "status": "complete",
        "message": None,
        "files": _build_file_entries(s3_client, request_id, review_key, files, bucket),
    }


def handler(event: dict, context=None) -> dict:
    path_params = event.get("pathParameters") or {}
    request_id = path_params.get("id")
    if not request_id:
        return error_response(400, "Missing request id")

    record = get_request(request_id)
    if record is None:
        return error_response(404, f"Request {request_id} not found")

    review_docs_stored = record.get("review_docs") or {}
    s3 = _s3_client()
    bucket = _S3_BUCKET

    review_docs = {}
    for key in ("ati", "itso", "integration"):
        review_docs[key] = _build_review_section(
            s3_client=s3,
            request_id=request_id,
            review_key=key,
            stored=review_docs_stored.get(key),
            bucket=bucket,
        )

    return response(200, {"request_id": request_id, "review_docs": review_docs})
