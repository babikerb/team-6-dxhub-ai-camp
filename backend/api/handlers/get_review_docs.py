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
- "pending"  — the review_docs entry is absent from DynamoDB (no upload yet).
               Message: "Review in progress, gathering documents"
- "complete" — files list is non-empty; presigned URLs are returned.
               Message: None (frontend shows the file links directly)
- "no_docs"  — DynamoDB entry exists but files list is empty.
               ATI / ITSO: "No documents found. Contact vendor"
               Integration: "No documents found"
"""

import os

import boto3
from botocore.exceptions import ClientError

from handlers.store import error_response, get_request, response

_S3_BUCKET = os.environ.get("REVIEW_DOCS_BUCKET", "")
_PRESIGN_EXPIRY = int(os.environ.get("PRESIGN_EXPIRY_SECONDS", "3600"))  # 1 hour

# Per-review-type messaging when there are no documents.
_NO_DOCS_MESSAGES = {
    "ati":         "No documents found. Contact vendor",
    "itso":        "No documents found. Contact vendor",
    "integration": "No documents found",
}

_PENDING_MESSAGE = "Review in progress, gathering documents"

# Map DynamoDB key → S3 folder name (for building the object key).
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
    if that key is absent (meaning no upload has happened yet for that type).
    """
    if stored is None:
        return {
            "status": "pending",
            "message": _PENDING_MESSAGE,
            "files": [],
        }

    files = stored.get("files", [])
    if not files:
        return {
            "status": "no_docs",
            "message": _NO_DOCS_MESSAGES[review_key],
            "files": [],
        }

    s3_folder = _REVIEW_TYPE_S3_FOLDER[review_key]
    file_entries = []
    for filename in files:
        s3_key = f"DataStored/{request_id}/{s3_folder}/{filename}"
        try:
            url = _presign(s3_client, bucket, s3_key, _PRESIGN_EXPIRY)
        except ClientError:
            url = None
        file_entries.append({"name": filename, "url": url})

    return {
        "status": "complete",
        "message": None,
        "files": file_entries,
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
