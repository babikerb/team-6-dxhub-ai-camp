"""PATCH /requests/{id}/admin -- admin dashboard edits/overrides.

Body shape:
{
  "overrides": {"ati_flag": bool|null, "security_flag": bool|null, "integration_flag": bool|null},
  "override_reason": "string",
  "overridden_by": "string",
  "admin_notes": "string",
  "status": "Submitted | ITReview | AdditionalReview | Approved | Denied",   # optional
  "attached_documents": {                                                    # optional
    "privacy_policy" | "terms_of_service" | "vpat" | "hecvat" | "soc2": "https://... | null"
  }
}

attached_documents lets a reviewer manually paste a document link the
requester didn't provide (or the security report's auto-search didn't find --
HECVAT/SOC2 are never asked of the requester, only auto-searched). These take
priority over the requester-provided vendor_*_url fields when the security
report next generates -- see security_report_generator._gather_documents().
"""

from . import store

ATTACHABLE_DOC_TYPES = {"privacy_policy", "terms_of_service", "vpat", "hecvat", "soc2"}


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    body = store.parse_body(event)

    overrides = body.get("overrides")
    if isinstance(overrides, dict):
        if any(v is not None for v in overrides.values()) and not body.get("override_reason"):
            return store.error_response(400, "override_reason is required when setting an override")
        record["admin"]["overrides"].update(overrides)

    if "override_reason" in body:
        record["admin"]["override_reason"] = body["override_reason"]
    if "overridden_by" in body:
        record["admin"]["overridden_by"] = body["overridden_by"]
    if "admin_notes" in body:
        record["admin"]["admin_notes"] = body["admin_notes"]

    attached = body.get("attached_documents")
    if isinstance(attached, dict):
        unknown = set(attached) - ATTACHABLE_DOC_TYPES
        if unknown:
            return store.error_response(400, f"Unknown doc type(s): {sorted(unknown)}")
        for url in attached.values():
            if url is not None and not (isinstance(url, str) and url.strip().lower().startswith("http")):
                return store.error_response(400, "Document URLs must start with http:// or https://, or be null")
        record["admin"].setdefault("attached_documents", {}).update(attached)

    new_status = body.get("status")
    if new_status:
        if new_status not in store.VALID_STATUSES:
            return store.error_response(400, f"Invalid status: {new_status}")
        record["status"] = new_status

    record["updated_at"] = store.now_iso()

    store.save_request(record)
    return store.response(200, record)
