"""Archives review documents to S3 under the agreed convention:

    s3://<bucket>/DataStored/<request_id>/<ReviewFolder>/<doc_type>.<ext>
    s3://<bucket>/DataStored/<request_id>/<ReviewFolder>/review_verdict.json

Which review folder a document belongs in is fixed by DOC_TYPE_TO_FOLDER --
privacy policy and VPAT feed the ATI (accessibility) review; HECVAT, SOC 2,
and Terms of Service feed the ITSO (security) review. Only ITSO actually has
an automated verdict today (security_report_generator.py); ATI and
Integration reviews aren't built yet, so their review_verdict.json is simply
not written until those pipelines exist -- nothing here fabricates one.

Also provides read helpers so ATI/ITSO generators can consume requester-
uploaded evidence already sitting in the bucket (not just public URLs).

Uploads are best-effort: a failure must never break report generation, so
every call here is wrapped by the caller in a broad try/except (see
security_report_generator.generate_report()).
"""

import io
import json
import os
import re

_BUCKET = os.environ.get(
    "DATA_BUCKET",
    os.environ.get(
        "REVIEW_DOCS_BUCKET",
        "dxhub-camp-2026-sdsu-software-request-and-institutional-c7fe61",
    ),
)
_REGION = os.environ.get("AWS_REGION", "us-west-2")
_s3 = None
_MAX_READ_BYTES = 5_000_000
_MAX_TEXT_CHARS = 12000
_MAX_PDF_PAGES = 40

DOC_TYPE_TO_FOLDER = {
    "privacy_policy": "ATI",
    "vpat": "ATI",
    "hecvat": "ITSO",
    "soc2": "ITSO",
    "terms_of_service": "ITSO",
    "integration_document": "Integration",
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


def _bytes_to_text(raw_bytes: bytes, content_type: str | None) -> str:
    ct = (content_type or "").lower()
    if "pdf" in ct or (not ct and raw_bytes[:4] == b"%PDF"):
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(raw_bytes))
            pages = [(p.extract_text() or "") for p in reader.pages[:_MAX_PDF_PAGES]]
            return re.sub(r"\s+", " ", " ".join(pages)).strip()[:_MAX_TEXT_CHARS]
        except Exception:  # noqa: BLE001
            return ""
    try:
        decoded = raw_bytes.decode("utf-8", errors="ignore")
    except Exception:  # noqa: BLE001
        return ""
    if "html" in ct:
        text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", decoded)
        text = re.sub(r"(?s)<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", text).strip()[:_MAX_TEXT_CHARS]
    return re.sub(r"\s+", " ", decoded).strip()[:_MAX_TEXT_CHARS]


def read_object(key: str) -> dict | None:
    """Read one S3 object and return {key, raw_bytes, content_type, text} or None."""
    if not key or not _BUCKET:
        return None
    try:
        resp = _get_s3().get_object(Bucket=_BUCKET, Key=key)
        raw = resp["Body"].read(_MAX_READ_BYTES + 1)
        if len(raw) > _MAX_READ_BYTES:
            raw = raw[:_MAX_READ_BYTES]
        content_type = resp.get("ContentType") or "application/octet-stream"
        return {
            "key": key,
            "raw_bytes": raw,
            "content_type": content_type,
            "text": _bytes_to_text(raw, content_type),
            "size_bytes": len(raw),
        }
    except Exception:  # noqa: BLE001
        return None


def load_requester_evidence(record: dict, doc_types: list[str] | None = None) -> dict[str, dict]:
    """Load requester-uploaded evidence from DynamoDB metadata + S3.

    Returns {doc_type: {url/s3_key, source, text, fetched, raw_bytes, content_type}}.
    """
    docs = record.get("requester_documents") or {}
    if not isinstance(docs, dict):
        return {}

    wanted = set(doc_types) if doc_types else set(docs)
    out: dict[str, dict] = {}
    for doc_type, entry in docs.items():
        if doc_type not in wanted or not isinstance(entry, dict):
            continue
        key = entry.get("s3_key")
        if not key:
            continue
        loaded = read_object(key)
        out[doc_type] = {
            "doc_type": doc_type,
            "url": entry.get("source_url") or f"s3://{_BUCKET}/{key}",
            "s3_key": key,
            "source": entry.get("source") or "requester_upload",
            "filename": entry.get("filename"),
            "fetched": bool(loaded and loaded.get("text")),
            "text": (loaded or {}).get("text") or None,
            "raw_bytes": (loaded or {}).get("raw_bytes"),
            "content_type": (loaded or {}).get("content_type") or entry.get("content_type"),
        }
    return out
