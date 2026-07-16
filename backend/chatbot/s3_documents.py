"""Archives review documents to S3 under the agreed convention:

    s3://<bucket>/DataStored/<request_id>/<ReviewFolder>/<doc_type>.<ext>
    s3://<bucket>/DataStored/<request_id>/<ReviewFolder>/review_verdict.json

Which review folder a document belongs in is fixed by DOC_TYPE_TO_FOLDER --
privacy policy and VPAT feed the ATI (accessibility) review; HECVAT, SOC 2,
and Terms of Service feed the ITSO (security) review. Only ITSO actually has
an automated verdict today (security_report_generator.py); ATI and
Integration reviews aren't built yet, so their review_verdict.json is simply
not written until those pipelines exist -- nothing here fabricates one.

Uploads are best-effort: a failure must never break report generation, so
every call here is wrapped by the caller in a broad try/except (see
security_report_generator.generate_report()).
"""

import json
import os

_BUCKET = os.environ.get(
    "DATA_BUCKET", "dxhub-camp-2026-sdsu-software-request-and-institutional-c7fe61"
)
_REGION = os.environ.get("AWS_REGION", "us-west-2")
_s3 = None

DOC_TYPE_TO_FOLDER = {
    "privacy_policy": "ATI",
    "vpat": "ATI",
    "hecvat": "ITSO",
    "soc2": "ITSO",
    "terms_of_service": "ITSO",
}

_EXTENSION_BY_CONTENT_TYPE = {
    "pdf": "pdf",
    "html": "html",
    "json": "json",
    "plain": "txt",
}


def _get_s3():
    global _s3
    if _s3 is None:
        import boto3

        _s3 = boto3.client("s3", region_name=_REGION)
    return _s3


def _extension_for(content_type: str | None, url: str | None) -> str:
    ct = (content_type or "").lower()
    for needle, ext in _EXTENSION_BY_CONTENT_TYPE.items():
        if needle in ct:
            return ext
    # Content-Type was missing/unrecognized -- fall back to the URL's own suffix.
    path = (url or "").split("?")[0].lower()
    for ext in ("pdf", "html", "htm", "txt", "json"):
        if path.endswith("." + ext):
            return "html" if ext == "htm" else ext
    return "html"


def upload_document(request_id: str, doc_type: str, raw_bytes: bytes, content_type: str, url: str) -> str | None:
    """Upload one fetched document. Returns the S3 key, or None if doc_type
    isn't mapped to a review folder or there's nothing to upload."""
    folder = DOC_TYPE_TO_FOLDER.get(doc_type)
    if not folder or not raw_bytes:
        return None
    ext = _extension_for(content_type, url)
    key = f"DataStored/{request_id}/{folder}/{doc_type}.{ext}"
    _get_s3().put_object(
        Bucket=_BUCKET,
        Key=key,
        Body=raw_bytes,
        ContentType=content_type or "application/octet-stream",
    )
    return key


def upload_review_verdict(request_id: str, review_folder: str, verdict: dict) -> str:
    """Upload the structured review result as review_verdict.json for the
    given review folder (e.g. "ITSO"). Returns the S3 key."""
    key = f"DataStored/{request_id}/{review_folder}/review_verdict.json"
    _get_s3().put_object(
        Bucket=_BUCKET,
        Key=key,
        Body=json.dumps(verdict, indent=2, default=str).encode("utf-8"),
        ContentType="application/json",
    )
    return key
