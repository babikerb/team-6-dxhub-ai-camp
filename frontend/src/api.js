// Shared API client for Intake Form, Chatbot, and Admin Dashboard.
// Talks to backend/api/ — run `python local_server.py` there in local dev.
// Set VITE_API_BASE_URL to the live API Gateway base URL (no trailing slash).

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return body;
}

/** POST /requests — create from the 18-question intake form. */
export async function createRequest(requestor) {
  return request("/requests", {
    method: "POST",
    body: JSON.stringify(requestor),
  });
}

/** GET /requests/{id} */
export async function getRequest(requestId) {
  return request(`/requests/${encodeURIComponent(requestId)}`);
}

/**
 * GET /requests — list with optional filters.
 * Returns { items, count }.
 */
export async function listRequests(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.department) params.set("department", filters.department);
  if (filters.flag) params.set("flag", filters.flag);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  return request(`/requests${qs ? `?${qs}` : ""}`);
}

/** PATCH /requests/{id}/chatbot — persist it_review; backend computes flags. */
export async function submitChatbotReview(requestId, itReview) {
  return request(`/requests/${encodeURIComponent(requestId)}/chatbot`, {
    method: "PATCH",
    body: JSON.stringify({ it_review: itReview }),
  });
}

/**
 * PATCH /requests/{id}/admin — top-level payload (not nested under "admin"):
 * { overrides, override_reason, overridden_by, admin_notes, status? }
 */
export async function patchAdmin(requestId, payload) {
  return request(`/requests/${encodeURIComponent(requestId)}/admin`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /chatbot/match-software — fuzzy/semantic match of a requested software
 * name against the SDSU catalog, plus approved-alternative suggestions.
 * Returns {status, matched_name, match_confidence, alternatives:[{name,why}], reasoning}.
 */
export async function matchSoftware(softwareName, useDescription, catalog) {
  return request("/chatbot/match-software", {
    method: "POST",
    body: JSON.stringify({
      software_name: softwareName,
      use_description: useDescription || undefined,
      catalog,
    }),
  });
}
