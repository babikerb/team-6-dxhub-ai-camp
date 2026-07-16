// Single source of truth for request status metadata — used by AdminDashboard,
// RequestDetail, and ProcurementSearch so all three never drift out of sync.
//
// Stages mirror SDSU's actual Software Request Process as far as this app's
// scope reaches (data/Software Request Infographic.pdf, data/Software Request
// Workflow-v2.pdf): Submit -> IT Services & Support triage -> Additional
// Review -> Approved / Denied.
//
// ATI, ITSO, and Integration review run independently and in parallel
// (per the real workflow), not one after another -- so they're represented
// as a single "AdditionalReview" status, not three sequential ones. Which
// specific review(s) apply to a request is tracked by its
// ati_flag/security_flag/integration_flag, not by status.
// (ITSO is the security review; its data key remains security_flag.)

export const STATUS_ORDER = [
  "Submitted",
  "ITReview",
  "AdditionalReview",
  "Approved",
  "Denied",
];

// Short label for badges/pills in the admin dashboard.
export const STATUS_LABELS = {
  Submitted: "Submitted",
  ITReview: "IT Review",
  AdditionalReview: "Additional Review",
  Approved: "Approved",
  Denied: "Denied",
};

// Stepper-only override: before a decision is made, showing "Approved" as an
// upcoming step presumes the outcome. The stepper shows the neutral stage
// name instead; the actual outcome still shows once status *is* Approved/Denied.
export const STATUS_STEPPER_LABELS = {
  ...STATUS_LABELS,
  Approved: "Review Decision",
};

// One-line explanation shown to reviewers (e.g. in the status change control).
export const STATUS_DESCRIPTIONS = {
  Submitted:
    "Request form submitted. Awaiting the automated IT interview (chatbot).",
  ITReview:
    "Chatbot interview complete — flags computed. IT Services & Support is triaging before routing to additional review.",
  AdditionalReview:
    "With ATI, ITSO, and/or Integration reviewers — these run independently and in parallel, not one after another. See Computed Flags below for which apply.",
  Approved:
    "IT review passed. Request proceeds to Procurement outside this system.",
  Denied:
    "Request was denied — a review didn't pass, or it was withdrawn.",
};

// Plain-English copy for the requester-facing status lookup (no internal jargon).
export const STATUS_REQUESTER_LABELS = {
  Submitted: "Submitted",
  ITReview: "Being triaged by IT Services & Support",
  AdditionalReview: "In additional review (ATI / ITSO / Integration)",
  Approved: "Approved — proceeding to procurement",
  Denied: "Denied",
};

export const STATUS_COLORS = {
  Submitted: "#1565C0",
  ITReview: "#00838F",
  AdditionalReview: "#B5650B",
  Approved: "#2E7D32",
  Denied: "var(--red-dark)",
};

export function statusColor(status) {
  return STATUS_COLORS[status] || "var(--stone)";
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Unknown";
}
