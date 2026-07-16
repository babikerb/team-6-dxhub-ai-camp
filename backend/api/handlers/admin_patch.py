"""PATCH /requests/{id}/admin -- admin dashboard edits/overrides.

Body shape:
{
  "overrides": {"ati_flag": bool|null, "security_flag": bool|null, "integration_flag": bool|null},
  "review_completions": {"ati_flag": bool, "security_flag": bool, "integration_flag": bool},  # optional
  "override_reason": "string",
  "overridden_by": "string",
  "admin_notes": "string",
  "status": "Submitted | ITReview | AdditionalReview | Approved | Denied"   # optional
}
"""

from . import store

FLAG_KEYS = ("ati_flag", "security_flag", "integration_flag")


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    body = store.parse_body(event)

    # Records written before these fields existed must still be patchable.
    admin = record.setdefault("admin", {})
    admin.setdefault("overrides", {key: None for key in FLAG_KEYS})
    admin.setdefault("review_completions", {key: False for key in FLAG_KEYS})

    overrides = body.get("overrides")
    if isinstance(overrides, dict):
        if any(v is not None for v in overrides.values()) and not body.get("override_reason"):
            return store.error_response(400, "override_reason is required when setting an override")
        admin["overrides"].update(overrides)

    completions = body.get("review_completions")
    if completions is not None:
        if not isinstance(completions, dict):
            return store.error_response(400, "review_completions must be an object")
        bad = [k for k, v in completions.items() if k not in FLAG_KEYS or not isinstance(v, bool)]
        if bad:
            return store.error_response(
                400, f"Invalid review_completions entries: {', '.join(sorted(bad))}"
            )
        admin["review_completions"].update(completions)

    if "override_reason" in body:
        admin["override_reason"] = body["override_reason"]
    if "overridden_by" in body:
        admin["overridden_by"] = body["overridden_by"]
    if "admin_notes" in body:
        admin["admin_notes"] = body["admin_notes"]

    new_status = body.get("status")
    if new_status:
        if new_status not in store.VALID_STATUSES:
            return store.error_response(400, f"Invalid status: {new_status}")
        record["status"] = new_status

    record["updated_at"] = store.now_iso()

    store.save_request(record)
    return store.response(200, record)
