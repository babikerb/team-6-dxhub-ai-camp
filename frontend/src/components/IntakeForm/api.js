// API layer for the Intake Form. Talks to the real backend (backend/api/) --
// run `python local_server.py` there before using this in dev.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function createRequest(requestor) {
  const res = await fetch(`${API_BASE}/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestor),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}
