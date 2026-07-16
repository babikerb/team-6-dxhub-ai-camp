"""GET /requests/{id} -- fetch a full record (used by chatbot + dashboard)."""

from . import store


def handler(event, context=None):
    request_id = (event.get("pathParameters") or {}).get("id")
    if not request_id:
        return store.error_response(400, "Missing request id in path")

    record = store.get_request(request_id)
    if record is None:
        return store.error_response(404, f"No request found with id {request_id}")

    record["estimated_days_remaining"] = store.estimate_days_remaining(record)
    return store.response(200, record)
