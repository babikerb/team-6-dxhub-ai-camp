// Calls the backend Bedrock parsing endpoint (backend/api -> /chatbot/parse),
// which maps a requester's free-text reply to the fixed answer options for one
// question and returns a confidence + cascade action. Run the backend first:
//   cd backend/api && python local_server.py   (with AWS creds for Bedrock)
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Question ids the parser understands (must match parse.py QUESTIONS keys).
export const PARSEABLE = new Set([
  "software_category",
  "shares_data_with_campus_system",
  "estimated_users",
  "interaction_method",
  "sso_capable",
  "la_health", "la_pii", "la_payment", "la_lawenforcement",
  "lb_coursework", "lb_employee", "lb_budget", "lb_research", "lb_legal",
]);

export async function parseReply(questionId, reply, intakeContext = {}) {
  const res = await fetch(`${API_BASE}/chatbot/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question_id: questionId,
      reply,
      intake_context: intakeContext,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Parse failed (${res.status})`);
  }
  return res.json(); // { answer, confidence, reasoning, quote, cascade_action }
}

// One turn of the multi-turn clarification loop. `history` is the full
// back-and-forth for the current question: [{role:"user"|"assistant", text}].
export async function converseTurn(questionId, questionText, history, intakeContext = {}) {
  const res = await fetch(`${API_BASE}/chatbot/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question_id: questionId,
      question_text: questionText,
      history,
      intake_context: intakeContext,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Converse failed (${res.status})`);
  }
  return res.json(); // { status, answer, confidence, message, show_options }
}
