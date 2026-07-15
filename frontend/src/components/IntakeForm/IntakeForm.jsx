import { useState } from "react";
import { createRequest, matchSoftware } from "./api.js";
import { matchCatalog, SDSU_CATALOG } from "./catalog.js";

// ---- Field config (mirrors the 18 questions in Chatbot_Questions_and_Flags.md, Part A) ----
// SECTIONS groups fields for the review screen and for lookups (ALL_FIELDS/FIELD_MAP).
// STEPS (further down) controls the actual wizard order/grouping shown to the user —
// `software_name` is pulled out into its own first step so we can check the SDSU
// software catalog before asking anything else.
const SECTIONS = [
  {
    title: "Who is this for?",
    fields: [
      { id: "requested_for_name", label: "Who is this software requested on behalf of?", type: "text", required: true, placeholder: "Full name" },
      { id: "requested_for_phone", label: "What is their phone number?", type: "text", required: true, placeholder: "(619) 555-0100" },
      { id: "requested_for_email", label: "What is their email address?", type: "email", required: true, placeholder: "name@sdsu.edu" },
      { id: "department", label: "What department are they in?", type: "text", required: true, placeholder: "e.g. College of Engineering" },
    ],
  },
  {
    title: "Who will use it?",
    fields: [
      {
        id: "user_types",
        label: "Who will use this software?",
        type: "multiChoice",
        required: true,
        options: ["Student", "Faculty", "Staff", "Public"].map((v) => ({ label: v, value: v })),
      },
      {
        id: "scope_of_usage",
        label: "Scope of usage",
        type: "singleChoice",
        required: true,
        options: [
          { label: "University/campus-wide", value: "University" },
          { label: "College/School", value: "College" },
          { label: "Department/Office", value: "Department" },
          { label: "Classroom", value: "Classroom" },
          { label: "Individual", value: "Individual" },
          { label: "Research Lab/Project", value: "Research Lab" },
          { label: "Public", value: "Public" },
        ],
      },
    ],
  },
  {
    title: "About the software",
    fields: [
      { id: "software_name", label: "Requested software name", type: "text", required: true, placeholder: "e.g. Adobe Creative Cloud" },
      { id: "use_description", label: "What will the technology be used for? Brief explanation.", type: "textarea", required: true, placeholder: "Briefly describe the use case..." },
      { id: "vendor_website", label: "Enter the vendor's website", type: "text", required: true, placeholder: "https://vendor.com" },
    ],
  },
  {
    title: "Term & budget",
    fields: [
      {
        id: "software_term",
        label: "Software term",
        type: "singleChoice",
        required: true,
        options: ["Monthly", "6mo or fewer", "1yr", "2yr", "3yr", "4yr", "5yr+"].map((v) => ({ label: v, value: v })),
      },
      { id: "estimated_spend", label: "Estimated total spend for the software term ($)", type: "number", required: true, placeholder: "0.00" },
      {
        id: "purchase_type",
        label: "Is this a renewal or new purchase?",
        type: "singleChoice",
        required: true,
        options: [
          { label: "Renewal", value: "renewal" },
          { label: "New purchase", value: "new" },
        ],
      },
      {
        id: "funding_source",
        label: "What is the funding source?",
        type: "singleChoice",
        required: true,
        options: [
          { label: "SDSU stateside", value: "SDSU stateside" },
          { label: "SDSU Research Foundation", value: "SDSU Research Foundation" },
        ],
      },
      { id: "college_division", label: "What College/Division will be procuring the software?", type: "text", required: true, placeholder: "e.g. Business & Financial Affairs" },
    ],
  },
  {
    title: "A few more details",
    fields: [
      {
        id: "existing_requisition",
        label: "Is there already a requisition for this software?",
        type: "singleChoice",
        required: true,
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      },
      {
        id: "needs_install_help",
        label: "Do you need help with installation?",
        type: "singleChoice",
        required: true,
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      },
      {
        id: "notify_list",
        label: "Who else should be notified about the progress of this request?",
        type: "text",
        required: false,
        placeholder: "Comma-separated names or emails",
        hint: "Optional — separate multiple people with commas.",
      },
      {
        id: "additional_details",
        label: "Additional details / supporting documentation",
        type: "textarea",
        required: false,
        placeholder: "Optional notes, e.g. a link to a vendor quote",
      },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields);
const FIELD_MAP = Object.fromEntries(ALL_FIELDS.map((field) => [field.id, field]));

// Wizard steps: one screen per group of related questions. `software_name` is asked
// alone, first, so the SDSU catalog can be checked before the requester answers the
// other 17 questions. The rest of "About the software" follows later, in its normal
// place, once we already know the catalog doesn't cover it.
const STEPS = [
  { title: "About the software", fields: ["software_name"] },
  { title: "Who is this for?", fields: ["requested_for_name", "requested_for_phone", "requested_for_email", "department"] },
  { title: "Who will use it?", fields: ["user_types", "scope_of_usage"] },
  { title: "About the software", fields: ["use_description", "vendor_website"] },
  { title: "Term & budget", fields: ["software_term", "estimated_spend", "purchase_type", "funding_source", "college_division"] },
  { title: "A few more details", fields: ["existing_requisition", "needs_install_help", "notify_list", "additional_details"] },
];

function stepIndexForField(fieldId) {
  return STEPS.findIndex((s) => s.fields.includes(fieldId));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;

function initialFormState() {
  const state = {};
  for (const field of ALL_FIELDS) {
    state[field.id] = field.type === "multiChoice" ? [] : "";
  }
  return state;
}

function fieldError(field, form) {
  const value = form[field.id];

  if (field.required) {
    if (field.type === "multiChoice") {
      if (!value || value.length === 0) return "Select at least one option.";
    } else if (field.type === "singleChoice") {
      if (value === "" || value === undefined) return "Please make a selection.";
    } else if (value === undefined || String(value).trim() === "") {
      return "This field is required.";
    }
  }

  if (field.id === "requested_for_email" && value && !EMAIL_RE.test(value.trim())) {
    return "Enter a valid email address.";
  }
  if (field.id === "vendor_website" && value && !URL_RE.test(value.trim())) {
    return "Enter a valid URL (e.g. https://vendor.com).";
  }
  if (field.id === "estimated_spend" && value !== "") {
    const n = Number(value);
    if (Number.isNaN(n) || n < 0) return "Enter a valid, non-negative number.";
  }

  return null;
}

function validate(form) {
  const errors = {};
  for (const field of ALL_FIELDS) {
    const err = fieldError(field, form);
    if (err) errors[field.id] = err;
  }
  return errors;
}

function formatValue(field, value) {
  if (field.type === "multiChoice") {
    if (!value || value.length === 0) return "—";
    return field.options.filter((o) => value.includes(o.value)).map((o) => o.label).join(", ");
  }
  if (field.type === "singleChoice") {
    const opt = field.options.find((o) => o.value === value);
    return opt ? opt.label : "—";
  }
  if (value === "" || value === undefined || value === null) return "—";
  return String(value);
}

function buildRequestor(form) {
  return {
    requested_for_name: form.requested_for_name.trim(),
    requested_for_phone: form.requested_for_phone.trim(),
    requested_for_email: form.requested_for_email.trim(),
    department: form.department.trim(),
    user_types: form.user_types,
    scope_of_usage: form.scope_of_usage,
    software_name: form.software_name.trim(),
    use_description: form.use_description.trim(),
    vendor_website: form.vendor_website.trim(),
    software_term: form.software_term,
    estimated_spend: Number(form.estimated_spend),
    purchase_type: form.purchase_type,
    funding_source: form.funding_source,
    college_division: form.college_division.trim(),
    existing_requisition: form.existing_requisition,
    needs_install_help: form.needs_install_help,
    notify_list: form.notify_list
      ? form.notify_list.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    additional_details: form.additional_details.trim(),
  };
}

function PillGroup({ options, value, multi, onSelect }) {
  return (
    <div style={styles.pillWrap}>
      {options.map((opt) => {
        const active = multi ? (value || []).includes(opt.value) : value === opt.value;
        return (
          <button
            type="button"
            key={String(opt.value)}
            onClick={() => onSelect(opt.value)}
            style={{ ...styles.pillButton, ...(active ? styles.pillButtonActive : null) }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CatalogCard({ match }) {
  return (
    <div style={styles.catalogCard}>
      <div style={styles.catalogCardTitle}>{match.name}</div>
      <div style={styles.catalogCardMeta}>{match.developer} · {match.category}</div>
      <div style={styles.catalogCardDesc}>{match.description}</div>
      <a href={match.url} target="_blank" rel="noreferrer" style={styles.catalogCardLink}>
        View on SDSU IT catalog →
      </a>
    </div>
  );
}

function IntakeForm({ onSubmitted }) {
  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [view, setView] = useState("question"); // "question" | "catalogMatch" | "alternatives" | "review" | "ended" | "confirmation"
  const [stepIndex, setStepIndex] = useState(0);
  const [catalogMatches, setCatalogMatches] = useState([]);
  const [alternatives, setAlternatives] = useState([]);
  const [checking, setChecking] = useState(false);
  const [pendingStepIndex, setPendingStepIndex] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [copied, setCopied] = useState(false);

  function clearError(id) {
    setErrors((e) => {
      if (!e[id]) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  function setField(id, value) {
    setForm((f) => ({ ...f, [id]: value }));
    clearError(id);
  }

  function toggleMultiValue(id, value) {
    setForm((f) => {
      const cur = f[id] || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...f, [id]: next };
    });
    clearError(id);
  }

  function goToStep(index) {
    setStepIndex(index);
    setView("question");
  }

  function handleBack() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }

  function advanceFrom(index) {
    if (index >= STEPS.length - 1) {
      setView("review");
    } else {
      setStepIndex(index + 1);
    }
  }

  async function handleNext() {
    const group = STEPS[stepIndex];
    const groupErrors = {};
    for (const fieldId of group.fields) {
      const err = fieldError(FIELD_MAP[fieldId], form);
      if (err) groupErrors[fieldId] = err;
    }
    if (Object.keys(groupErrors).length > 0) {
      setErrors((e) => ({ ...e, ...groupErrors }));
      return;
    }
    for (const fieldId of group.fields) clearError(fieldId);

    if (group.fields.includes("software_name")) {
      setPendingStepIndex(stepIndex + 1 >= STEPS.length ? STEPS.length : stepIndex + 1);

      // 1) Instant keyword check for exact/alias hits (no network).
      const matches = matchCatalog(form.software_name);
      if (matches.length > 0) {
        setCatalogMatches(matches);
        setView("catalogMatch");
        return;
      }

      // 2) Fuzzy/semantic check + approved alternatives via the LLM matcher.
      //    Catches variants/typos/rebrands the keyword pass misses, and suggests
      //    approved options when SDSU doesn't offer the requested tool.
      setChecking(true);
      try {
        const r = await matchSoftware(form.software_name, form.use_description, SDSU_CATALOG);
        if (r.status === "offered" && r.matched_name) {
          const entry = SDSU_CATALOG.find((e) => e.name === r.matched_name);
          if (entry) {
            setCatalogMatches([entry]);
            setView("catalogMatch");
            return;
          }
        } else if (r.status === "alternative_available" && (r.alternatives || []).length > 0) {
          const alts = r.alternatives
            .map((a) => {
              const entry = SDSU_CATALOG.find((e) => e.name === a.name);
              return entry ? { ...entry, why: a.why } : null;
            })
            .filter(Boolean);
          if (alts.length > 0) {
            setAlternatives(alts);
            setView("alternatives");
            return;
          }
        }
        // "not_found" (or nothing usable) — fall through and continue the request.
      } catch {
        // Matcher unavailable — never block the requester; just continue.
      } finally {
        setChecking(false);
      }
    }

    advanceFrom(stepIndex);
  }

  function continueAfterCatalogMatch() {
    if (pendingStepIndex === null || pendingStepIndex >= STEPS.length) {
      setView("review");
    } else {
      setStepIndex(pendingStepIndex);
      setView("question");
    }
  }

  function endAsCatalogMatch() {
    setView("ended");
  }

  function startOver() {
    setForm(initialFormState());
    setErrors({});
    setCatalogMatches([]);
    setAlternatives([]);
    setPendingStepIndex(null);
    setStepIndex(0);
    setSubmitError(null);
    setView("question");
  }

  async function handleSubmit() {
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setSubmitError(null);
      const firstInvalidId = Object.keys(validationErrors)[0];
      goToStep(stepIndexForField(firstInvalidId));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const requestor = buildRequestor(form);
      const { request_id } = await createRequest(requestor);
      setRequestId(request_id);
      setView("confirmation");
    } catch {
      setSubmitError("Something went wrong submitting your request. Please try again.");
      setSubmitting(false);
    }
  }

  async function copyRequestId() {
    try {
      await navigator.clipboard.writeText(requestId);
    } catch {
      const el = document.createElement("textarea");
      el.value = requestId;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function continueToChatbot() {
    onSubmitted(requestId);
  }

  function renderInput(field) {
    const value = form[field.id];

    if (field.type === "singleChoice") {
      return <PillGroup options={field.options} value={value} onSelect={(v) => setField(field.id, v)} />;
    }
    if (field.type === "multiChoice") {
      return <PillGroup options={field.options} value={value} multi onSelect={(v) => toggleMultiValue(field.id, v)} />;
    }
    if (field.type === "textarea") {
      return (
        <textarea
          id={`field-${field.id}`}
          style={styles.textarea}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => setField(field.id, e.target.value)}
        />
      );
    }
    if (field.type === "number") {
      return (
        <input
          id={`field-${field.id}`}
          style={styles.input}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => setField(field.id, e.target.value)}
        />
      );
    }
    return (
      <input
        id={`field-${field.id}`}
        style={styles.input}
        type={field.type === "email" ? "email" : "text"}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => setField(field.id, e.target.value)}
      />
    );
  }

  function renderQuestion() {
    const group = STEPS[stepIndex];
    const total = STEPS.length;
    const progressPct = Math.round(((stepIndex + 1) / total) * 100);

    return (
      <div style={styles.body}>
        <div style={styles.progressRow}>
          <div style={styles.stepBadge}>{group.title}</div>
          <div style={styles.stepCount}>Step {stepIndex + 1} of {total}</div>
        </div>
        <div style={styles.progressBarOuter}>
          <div style={{ ...styles.progressBarInner, width: `${progressPct}%` }} />
        </div>

        <div style={styles.section}>
          {group.fields.map((fieldId) => {
            const field = FIELD_MAP[fieldId];
            return (
              <div key={field.id} style={styles.field}>
                <label style={styles.label} htmlFor={`field-${field.id}`}>
                  {field.label}
                  {field.required && <span style={styles.required}> *</span>}
                </label>
                {field.type === "multiChoice" && (
                  <div style={styles.multiHint}>Select all that apply — you can choose more than one.</div>
                )}
                {renderInput(field)}
                {field.hint && !errors[field.id] && <div style={styles.hint}>{field.hint}</div>}
                {errors[field.id] && <div style={styles.error}>{errors[field.id]}</div>}
              </div>
            );
          })}
        </div>

        <div style={styles.navRow}>
          <button
            type="button"
            onClick={handleBack}
            disabled={stepIndex === 0}
            style={{ ...styles.backButton, ...(stepIndex === 0 ? styles.navButtonDisabled : null) }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={checking}
            style={{ ...styles.nextButton, ...(checking ? styles.navButtonDisabled : null) }}
          >
            {checking ? "Checking SDSU catalog…" : stepIndex === total - 1 ? "Review answers" : "Next"}
          </button>
        </div>
      </div>
    );
  }

  function renderCatalogMatch() {
    return (
      <div style={styles.body}>
        <div style={styles.catalogHeading}>Good news — this might already be available</div>
        <div style={styles.catalogSubheading}>
          Based on "{form.software_name}", SDSU already provides software that may cover this need:
        </div>
        <div style={styles.catalogList}>
          {catalogMatches.map((m) => (
            <CatalogCard key={m.name} match={m} />
          ))}
        </div>
        <button type="button" onClick={endAsCatalogMatch} style={styles.nextButton}>
          This covers it — I don't need to submit a request
        </button>
        <button type="button" onClick={continueAfterCatalogMatch} style={styles.continueLink}>
          None of these fit — continue my request anyway
        </button>
      </div>
    );
  }

  function renderAlternatives() {
    return (
      <div style={styles.body}>
        <div style={styles.catalogHeading}>SDSU may already have an approved option</div>
        <div style={styles.catalogSubheading}>
          SDSU doesn't currently offer "{form.software_name}", but these approved tools may cover the
          same need — choosing one can skip the review entirely:
        </div>
        <div style={styles.catalogList}>
          {alternatives.map((m) => (
            <div key={m.name} style={styles.catalogCard}>
              <div style={styles.catalogCardTitle}>{m.name}</div>
              <div style={styles.catalogCardMeta}>{m.developer} · {m.category}</div>
              <div style={styles.catalogCardDesc}>{m.description}</div>
              {m.why && <div style={styles.altWhy}>Why this fits: {m.why}</div>}
              <a href={m.url} target="_blank" rel="noreferrer" style={styles.catalogCardLink}>
                View on SDSU IT catalog →
              </a>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setCatalogMatches(alternatives); setView("ended"); }}
          style={styles.nextButton}
        >
          One of these works — I don't need to submit a request
        </button>
        <button type="button" onClick={continueAfterCatalogMatch} style={styles.continueLink}>
          None of these fit — continue my request anyway
        </button>
      </div>
    );
  }

  function renderEnded() {
    return (
      <div style={styles.body}>
        <div style={styles.catalogHeading}>You're all set</div>
        <div style={styles.catalogSubheading}>
          Use the existing SDSU-supported option below instead of filing a new software request. If you run into
          access issues, contact the SDSU IT Service Desk.
        </div>
        <div style={styles.catalogList}>
          {catalogMatches.map((m) => (
            <CatalogCard key={m.name} match={m} />
          ))}
        </div>
        <button type="button" onClick={startOver} style={styles.nextButton}>
          Start a different request
        </button>
      </div>
    );
  }

  function renderReview() {
    return (
      <div style={styles.body}>
        <div style={styles.catalogHeading}>Review your answers</div>
        <div style={styles.catalogSubheading}>Check everything below, then continue. Use Edit to change any answer.</div>

        {SECTIONS.map((section) => (
          <div key={section.title} style={styles.reviewSection}>
            <div style={styles.sectionTitle}>{section.title}</div>
            {section.fields.map((field) => (
              <div key={field.id} style={styles.reviewRow}>
                <div style={styles.reviewText}>
                  <div style={styles.reviewLabel}>{field.label}</div>
                  <div style={styles.reviewValue}>{formatValue(field, form[field.id])}</div>
                  {errors[field.id] && <div style={styles.error}>{errors[field.id]}</div>}
                </div>
                <button type="button" style={styles.editLink} onClick={() => goToStep(stepIndexForField(field.id))}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        ))}

        {submitError && <div style={styles.submitError}>{submitError}</div>}

        <div style={styles.navRow}>
          <button type="button" onClick={() => goToStep(STEPS.length - 1)} style={styles.backButton}>
            Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={{ ...styles.submitButton, ...(submitting ? styles.submitButtonDisabled : null) }}
            disabled={submitting}
          >
            {submitting ? "Continuing..." : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  function renderConfirmation() {
    return (
      <div style={styles.body}>
        <div style={styles.catalogHeading}>Request received</div>
        <div style={styles.catalogSubheading}>
          Save this incident ID before continuing — you'll need it to check on your request later.
        </div>
        <div style={styles.incidentBox}>
          <div style={styles.incidentId}>{requestId}</div>
          <button type="button" onClick={copyRequestId} style={styles.copyButton}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <button type="button" onClick={continueToChatbot} style={styles.nextButton}>
          Continue
        </button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerBadge}>SDSU</div>
          <div>
            <div style={styles.headerTitle}>Software Request Assistant</div>
            <div style={styles.headerSubtitle}>Intake form — a few questions at a time</div>
          </div>
        </div>

        {view === "question" && renderQuestion()}
        {view === "catalogMatch" && renderCatalogMatch()}
        {view === "alternatives" && renderAlternatives()}
        {view === "ended" && renderEnded()}
        {view === "review" && renderReview()}
        {view === "confirmation" && renderConfirmation()}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "24px",
    fontFamily: "'Segoe UI', Arial, sans-serif",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "560px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 20px",
    background: "#1A1A1A",
    color: "#fff",
  },
  headerBadge: {
    background: "#C8102E",
    color: "#fff",
    fontWeight: 700,
    fontSize: "12px",
    padding: "6px 10px",
    borderRadius: "8px",
    letterSpacing: "0.5px",
  },
  headerTitle: { fontWeight: 600, fontSize: "15px" },
  headerSubtitle: { fontSize: "12px", color: "#B3B3B3" },
  body: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    background: "#FAFAFA",
  },
  progressRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepBadge: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#C8102E",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  stepCount: {
    fontSize: "12px",
    color: "#888",
    fontWeight: 600,
  },
  progressBarOuter: {
    width: "100%",
    height: "6px",
    borderRadius: "999px",
    background: "#EDEDED",
    overflow: "hidden",
  },
  progressBarInner: {
    height: "100%",
    background: "#C8102E",
    borderRadius: "999px",
    transition: "width 0.2s ease",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  sectionTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#C8102E",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid #EDEDED",
    paddingBottom: "6px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#1A1A1A",
  },
  required: { color: "#C8102E" },
  input: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1.5px solid #DDD",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: "#fff",
  },
  textarea: {
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1.5px solid #DDD",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    minHeight: "70px",
    resize: "vertical",
    background: "#fff",
  },
  pillWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  pillButton: {
    padding: "8px 14px",
    borderRadius: "999px",
    border: "1.5px solid #C8102E",
    background: "#fff",
    color: "#C8102E",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  pillButtonActive: {
    background: "#C8102E",
    color: "#fff",
  },
  multiHint: {
    fontSize: "12px",
    color: "#C8102E",
    fontWeight: 600,
  },
  hint: {
    fontSize: "12px",
    color: "#888",
  },
  error: {
    fontSize: "12px",
    color: "#C8102E",
    fontWeight: 600,
  },
  submitError: {
    background: "#FDECEC",
    border: "1px solid #C8102E",
    color: "#C8102E",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 600,
  },
  incidentBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    background: "#fff",
    border: "1.5px solid #DDD",
    borderRadius: "10px",
    padding: "12px 14px",
  },
  incidentId: {
    fontFamily: "'Consolas', 'Courier New', monospace",
    fontSize: "14px",
    fontWeight: 700,
    color: "#1A1A1A",
    wordBreak: "break-all",
  },
  copyButton: {
    flexShrink: 0,
    padding: "8px 14px",
    borderRadius: "8px",
    border: "1.5px solid #1A1A1A",
    background: "#fff",
    color: "#1A1A1A",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
  },
  backButton: {
    padding: "12px 18px",
    borderRadius: "10px",
    border: "1.5px solid #DDD",
    background: "#fff",
    color: "#1A1A1A",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
  nextButton: {
    flex: 1,
    padding: "14px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#1A1A1A",
    color: "#fff",
    fontWeight: 700,
    fontSize: "15px",
    cursor: "pointer",
  },
  navButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  submitButton: {
    flex: 1,
    padding: "14px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#1A1A1A",
    color: "#fff",
    fontWeight: 700,
    fontSize: "15px",
    cursor: "pointer",
  },
  submitButtonDisabled: {
    background: "#888",
    cursor: "not-allowed",
  },
  catalogHeading: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#1A1A1A",
  },
  catalogSubheading: {
    fontSize: "13px",
    color: "#555",
    lineHeight: 1.5,
  },
  catalogList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  catalogCard: {
    border: "1.5px solid #EDEDED",
    borderRadius: "12px",
    padding: "14px 16px",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  catalogCardTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#1A1A1A",
  },
  catalogCardMeta: {
    fontSize: "12px",
    color: "#888",
    fontWeight: 600,
  },
  catalogCardDesc: {
    fontSize: "13px",
    color: "#333",
    lineHeight: 1.4,
  },
  catalogCardLink: {
    fontSize: "12px",
    color: "#C8102E",
    fontWeight: 700,
    textDecoration: "none",
    marginTop: "4px",
  },
  altWhy: {
    fontSize: "12.5px",
    color: "#1A1A1A",
    background: "#FFF6E9",
    border: "1px solid #F0E0C0",
    borderRadius: "8px",
    padding: "6px 10px",
    marginTop: "4px",
    lineHeight: 1.4,
  },
  continueLink: {
    background: "none",
    border: "none",
    color: "#666",
    fontSize: "13px",
    textDecoration: "underline",
    cursor: "pointer",
    padding: "4px",
    alignSelf: "center",
  },
  reviewSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  reviewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    borderBottom: "1px solid #EDEDED",
    paddingBottom: "10px",
  },
  reviewText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  reviewLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#888",
  },
  reviewValue: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#1A1A1A",
  },
  editLink: {
    background: "none",
    border: "1.5px solid #DDD",
    borderRadius: "8px",
    padding: "4px 10px",
    color: "#1A1A1A",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};

export default IntakeForm;
