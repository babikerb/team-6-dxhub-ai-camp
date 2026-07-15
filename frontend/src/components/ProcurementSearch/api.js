// API layer for procurement search. Talks to the real backend (backend/api/) --
// run `python local_server.py` there before using this in dev.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function getRequestByProcurementId(procurementId) {
  const res = await fetch(`${API_BASE}/requests/${encodeURIComponent(procurementId)}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("No procurement found with that ID.");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}
