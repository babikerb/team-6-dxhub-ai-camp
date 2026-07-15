"""GET /requests -- list all requests. Supports filters via query params:
status, department, flag (ati_flag|security_flag|integration_flag), search (software name).
"""

from . import store


def handler(event, context=None):
    filters = event.get("queryStringParameters") or {}
    items = store.list_requests(filters)
    return store.response(200, {"items": items, "count": len(items)})
