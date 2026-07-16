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
 * POST /requests/{id}/ati-documents — Step 1 of the ATI review: find the
 * vendor's VPAT / privacy policy / terms. Synchronous; returns the updated
 * record with ati_review.documents populated.
 */
export async function retrieveAtiDocuments(requestId) {
  return request(`/requests/${encodeURIComponent(requestId)}/ati-documents`, {
    method: "POST",
  });
}

/**
 * POST /requests/{id}/ati-report — Step 2: generate the draft ATI review.
 * Returns 202 with ati_review.status = "pending"; the report lands
 * asynchronously (it reads the VPAT and calls Bedrock, well past any
 * request timeout). Poll getRequest until status is complete/failed.
 */
export async function generateAtiReport(requestId) {
  return request(`/requests/${encodeURIComponent(requestId)}/ati-report`, {
    method: "POST",
  });
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
 * POST /chatbot/identify-software — confirm what a named product actually is
 * ("Canva — online design platform"), grounded in a web search.
 * Returns {identified, canonical_name, one_liner, source_url, confidence}.
 */
export async function identifySoftware(softwareName, useDescription, vendorWebsite) {
  return request("/chatbot/identify-software", {
    method: "POST",
    body: JSON.stringify({
      software_name: softwareName,
      use_description: useDescription || undefined,
      vendor_website: vendorWebsite || undefined,
    }),
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

/**
 * GET /requests/{id}/review-docs — fetch review documents for a request.
 *
 * Returns:
 * {
 *   request_id: string,
 *   review_docs: {
 *     ati:         { status: "pending"|"complete"|"no_docs", message: string|null, files: [{name, url}] },
 *     itso:        { ... },
 *     integration: { ... }
 *   }
 * }
 *
 * status meanings:
 *   "pending"  — no upload has happened yet; message = "Review in progress, gathering documents"
 *   "complete" — files present; follow the presigned URLs in files[]
 *   "no_docs"  — upload event fired but no files found; message describes next step
 */
export async function getReviewDocs(requestId) {
  return request(`/requests/${encodeURIComponent(requestId)}/review-docs`);
}
