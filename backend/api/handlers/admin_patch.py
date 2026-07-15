"""PATCH /requests/{id}/admin -- admin dashboard edits/overrides.

Body shape:
{
  "overrides": {"ati_flag": bool|null, "security_flag": bool|null, "integration_flag": bool|null},
  "override_reason": "string",
  "overridden_by": "string",
  "admin_notes": "string",
  "status": "Submitted | ITReview | AdditionalReview | Approved | Denied"   # optional
}
"""

from . import store


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

    new_status = body.get("status")
    if new_status:
        if new_status not in store.VALID_STATUSES:
            return store.error_response(400, f"Invalid status: {new_status}")
        record["status"] = new_status

    record["updated_at"] = store.now_iso()

    store.save_request(record)
    return store.response(200, record)
