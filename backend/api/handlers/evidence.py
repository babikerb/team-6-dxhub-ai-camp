"""Canonical evidence document types shared by email, upload, dashboards, and
report generators.

Keep this mapping the single source of truth so a VPAT always lands in ATI,
HECVAT/SOC2/ToS in ITSO, and generic integration evidence in Integration.
"""

from __future__ import annotations

# Review folder keys used by the admin dashboards / review_docs DynamoDB shape.
REVIEW_TYPES = ("ati", "itso", "integration")

REVIEW_TYPE_S3_FOLDER = {
    "ati": "ATI",
    "itso": "ITSO",
    "integration": "Integration",
}

# Canonical document types the requester can upload / that missing-email asks for.
DOC_TYPES = {
    "vpat": {
        "label": "VPAT accessibility conformance report",
        "review_type": "ati",
        "extensions": (".pdf", ".html", ".htm", ".txt", ".doc", ".docx"),
    },
    "privacy_policy": {
        "label": "Privacy policy",
        "review_type": "ati",
        "extensions": (".pdf", ".html", ".htm", ".txt", ".doc", ".docx"),
    },
    "hecvat": {
        "label": "HECVAT security assessment questionnaire",
        "review_type": "itso",
        "extensions": (".pdf", ".xlsx", ".xls", ".csv", ".doc", ".docx", ".txt"),
    },
    "soc2": {
        "label": "SOC 2 report",
        "review_type": "itso",
        "extensions": (".pdf", ".doc", ".docx"),
    },
    "terms_of_service": {
        "label": "Terms of service",
        "review_type": "itso",
        "extensions": (".pdf", ".html", ".htm", ".txt", ".doc", ".docx"),
    },
    "integration_document": {
        "label": "Integration documentation",
        "review_type": "integration",
        "extensions": (".pdf", ".html", ".htm", ".txt", ".doc", ".docx", ".png", ".jpg", ".jpeg"),
    },
}

# Which document types a flagged review requires from the requester when public
# search cannot locate them. SOC 2 is deliberately excluded — it is rarely public.
FLAG_REQUIRED_DOCS = {
    "ati_flag": ("vpat", "privacy_policy"),
    "security_flag": ("hecvat", "terms_of_service"),
    "integration_flag": ("integration_document",),
}

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/html",
    "text/csv",
    "image/png",
    "image/jpeg",
    "application/octet-stream",
}

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB demo limit


def label_for(doc_type: str) -> str:
    info = DOC_TYPES.get(doc_type) or {}
    return info.get("label") or doc_type.replace("_", " ")


def review_type_for(doc_type: str) -> str | None:
    info = DOC_TYPES.get(doc_type)
    return info["review_type"] if info else None


def s3_folder_for(doc_type: str) -> str | None:
    review = review_type_for(doc_type)
    return REVIEW_TYPE_S3_FOLDER.get(review) if review else None


def required_doc_types(flags: dict | None) -> list[str]:
    """Return ordered unique document types required by the active flags."""
    flags = flags or {}
    seen: list[str] = []
    for flag_key, docs in FLAG_REQUIRED_DOCS.items():
        if not flags.get(flag_key):
            continue
        for doc_type in docs:
            if doc_type not in seen:
                seen.append(doc_type)
    return seen


def fulfilled_doc_types(record: dict) -> set[str]:
    """Document types the requester has already provided (uploads or links)."""
    docs = record.get("requester_documents") or {}
    fulfilled = set()
    if isinstance(docs, dict):
        for doc_type, entry in docs.items():
            if not isinstance(entry, dict):
                continue
            if entry.get("s3_key") or entry.get("source_url") or entry.get("status") == "uploaded":
                fulfilled.add(doc_type)
    return fulfilled


def missing_doc_types(record: dict, flags: dict | None = None) -> list[str]:
    flags = flags if flags is not None else (record.get("flags") or {})
    have = fulfilled_doc_types(record)
    return [d for d in required_doc_types(flags) if d not in have]


def evidence_filename(doc_type: str, original_name: str) -> str:
    """Prefix the safe basename with the canonical doc type for checklist matching."""
    base = str(original_name or "upload").replace("\\", "/").split("/")[-1].strip()
    # Strip a leading "<doc_type>." / "<doc_type>_" if the client already added it.
    lower = base.lower()
    for prefix in (f"{doc_type}.", f"{doc_type}_", f"{doc_type}-"):
        if lower.startswith(prefix):
            base = base[len(prefix) :]
            break
    return f"{doc_type}_{base}" if base else f"{doc_type}_upload"
