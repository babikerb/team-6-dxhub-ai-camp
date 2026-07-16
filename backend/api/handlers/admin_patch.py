"""PATCH /requests/{id}/admin -- admin dashboard edits/overrides.

Body shape:
{
  "overrides": {"ati_flag": bool|null, "security_flag": bool|null, "integration_flag": bool|null, "ai_flag": bool|null},
  "review_completions": {"ati_flag": bool, "security_flag": bool, "integration_flag": bool},  # optional
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

from . import emailer, store

ATTACHABLE_DOC_TYPES = {"privacy_policy", "terms_of_service", "vpat", "hecvat", "soc2"}
OVERRIDABLE_FLAG_KEYS = ("ati_flag", "security_flag", "integration_flag", "ai_flag")
REVIEW_FLAG_KEYS = ("ati_flag", "security_flag", "integration_flag")


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    body = store.parse_body(event)
    previous_status = record.get("status")

    # Records written before these fields existed must still be patchable.
    admin = record.setdefault("admin", {})
    overrides_state = admin.setdefault("overrides", {})
    for key in OVERRIDABLE_FLAG_KEYS:
        overrides_state.setdefault(key, None)
    completions_state = admin.setdefault("review_completions", {})
    for key in REVIEW_FLAG_KEYS:
        completions_state.setdefault(key, False)
    record.setdefault("notifications", {})

    overrides = body.get("overrides")
    if isinstance(overrides, dict):
        unknown = set(overrides) - set(OVERRIDABLE_FLAG_KEYS)
        if unknown:
            return store.error_response(400, f"Unknown override flag(s): {sorted(unknown)}")
        invalid = [key for key, value in overrides.items() if value is not None and not isinstance(value, bool)]
        if invalid:
            return store.error_response(400, f"Override values must be boolean or null: {sorted(invalid)}")
        if any(v is not None for v in overrides.values()) and not body.get("override_reason"):
            return store.error_response(400, "override_reason is required when setting an override")
        overrides_state.update(overrides)

    completions = body.get("review_completions")
    if completions is not None:
        if not isinstance(completions, dict):
            return store.error_response(400, "review_completions must be an object")
        bad = [k for k, v in completions.items() if k not in REVIEW_FLAG_KEYS or not isinstance(v, bool)]
        if bad:
            return store.error_response(
                400, f"Invalid review_completions entries: {', '.join(sorted(bad))}"
            )
        completions_state.update(completions)

    if "override_reason" in body:
        admin["override_reason"] = body["override_reason"]
    if "overridden_by" in body:
        admin["overridden_by"] = body["overridden_by"]
    if "admin_notes" in body:
        admin["admin_notes"] = body["admin_notes"]

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

    # Email 4 — final verdict when landing on Approved / Denied.
    # Retry if a prior send failed (notifications.verdict_sent_at missing).
    if record.get("status") in {"Approved", "Denied"} and (
        new_status != previous_status
        or not emailer.already_sent(record, "verdict_sent_at")
    ):
        try:
            if emailer.send_verdict_email(record):
                store.save_request(record)
        except Exception as exc:  # noqa: BLE001
            print(f"Verdict email failed for {request_id}: {exc}")

    return store.response(200, record)
