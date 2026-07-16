import { useState } from "react";
import { createRequest, matchSoftware, identifySoftware } from "./api.js";
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
        hint: "Optional. Separate multiple people with commas.",
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
            style={{
              ...styles.pillButton,
              borderLeftColor: active ? "var(--red)" : "transparent",
              background: active ? "var(--paper-alt)" : "transparent",
            }}
          >
            <span>{opt.label}</span>
            <span style={{ ...styles.pillMark, opacity: active ? 1 : 0.25 }}>{active ? "✓" : "○"}</span>
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
        View on SDSU IT catalog &rarr;
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
  // What we think the requested software IS. Held outside `form` on purpose:
  // form state is generated from ALL_FIELDS, and this is a confirmation, not a
  // new intake question.
  const [identity, setIdentity] = useState(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
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
    // Editing the name invalidates any confirmation of the old one.
    if (id === "software_name") {
      setIdentity(null);
      setIdentityConfirmed(false);
    }
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

  // Catalog + alternatives checks for the software-name step. Returns true if it
  // took over the screen (caller should stop), false to continue the form.
  // Split out of handleNext so the identity-confirm step can resume it: state
  // updates aren't flushed synchronously, so re-entering handleNext would read
  // a stale identityConfirmed and loop the confirm screen forever.
  async function runCatalogChecks() {
    // 1) Instant keyword check for exact/alias hits (no network).
    const matches = matchCatalog(form.software_name);
    if (matches.length > 0) {
      setCatalogMatches(matches);
      setView("catalogMatch");
      return true;
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
          return true;
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
          return true;
        }
      }
      // "not_found" (or nothing usable) — fall through and continue the request.
    } catch {
      // Matcher unavailable — never block the requester; just continue.
    } finally {
      setChecking(false);
    }
    return false;
  }

  // "Yes, that's the right software" — record it and pick up where handleNext left off.
  async function confirmIdentity() {
    setIdentityConfirmed(true);
    setView("question");
    const showed = await runCatalogChecks();
    if (!showed) advanceFrom(stepIndex);
  }

  // "No / let me fix the name" — back to the name field, and allow a re-check.
  function rejectIdentity() {
    setIdentity(null);
    setIdentityConfirmed(false);
    setView("question");
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

      // 0) Confirm we understood WHICH product this is ("Canva — online design
      //    platform. Is that right?") before the rest of the form assumes it.
      //    Skipped once confirmed so Back/Next doesn't re-ask.
      if (!identityConfirmed) {
        setChecking(true);
        try {
          const id = await identifySoftware(
            form.software_name, form.use_description, form.vendor_website,
          );
          setIdentity(id);
          setView("confirmSoftware");
          return;
        } catch {
          // Identify unavailable — never block the requester; carry on.
        } finally {
          setChecking(false);
        }
      }

      const showed = await runCatalogChecks();
      if (showed) return;
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
    setIdentity(null);
    setIdentityConfirmed(false);
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

    return (
      <div style={styles.body}>
        <div style={styles.progressRow}>
          <div style={styles.stepBadge}>{group.title}</div>
          <div style={styles.stepCount}>Step {stepIndex + 1} of {total}</div>
        </div>
        <div style={styles.dotsWrap}>
          {STEPS.map((s, i) => (
            <div key={s.title + i} style={styles.dotUnit}>
              <div
                style={{
                  ...styles.dot,
                  background: i < stepIndex ? "var(--red)" : i === stepIndex ? "#fff" : "var(--paper-alt)",
                  borderColor: i <= stepIndex ? "var(--red)" : "var(--line)",
                }}
              />
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    ...styles.dotLine,
                    background: i < stepIndex ? "var(--red)" : "var(--line)",
                  }}
                />
              )}
            </div>
          ))}
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
                  <div style={styles.multiHint}>Select all that apply. You can choose more than one.</div>
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

  // "Canva — online design platform. Is that right?"
  // Two jobs: catch the wrong product early (Canva vs Canvas are one letter
  // apart and unrelated), and capture what the software does for the reviewer,
  // which is otherwise step 6 of their manual checklist.
  function renderConfirmSoftware() {
    const found = identity && identity.identified;
    return (
      <div style={styles.body}>
        <div style={styles.catalogEyebrow}>
          {found ? "Confirm the software" : "We couldn't find this one"}
        </div>
        <div style={styles.catalogHeading}>
          {found ? "Is this the right software?" : `Is "${form.software_name}" spelled correctly?`}
        </div>

        {found ? (
          <div style={styles.identityCard}>
            <div style={styles.identityName}>{identity.canonical_name}</div>
            <div style={styles.identityFunction}>{identity.one_liner}</div>
            {identity.source_url && (
              <a
                href={identity.source_url}
                target="_blank"
                rel="noreferrer"
                style={styles.catalogCardLink}
              >
                Where this came from →
              </a>
            )}
          </div>
        ) : (
          <div style={styles.catalogSubheading}>
            We looked online and couldn't find a software product by this name. That's fine for
            specialized or in-house tools — but if it's a typo, fixing it now saves a round trip
            with IT later.
          </div>
        )}

        <div style={styles.catalogActions}>
          <button type="button" onClick={confirmIdentity} style={styles.nextButton}>
            {found ? "Yes, that's the software I need" : "The name is correct — continue"}
          </button>
          <button type="button" onClick={rejectIdentity} style={styles.continueLink}>
            {found ? "No, that's not it — let me change the name" : "Let me fix the name"}
          </button>
        </div>
      </div>
    );
  }

  function renderCatalogMatch() {
    return (
      <div style={styles.body}>
        <div style={styles.catalogEyebrow}>Catalog match found</div>
        <div style={styles.catalogHeading}>This might already be available</div>
        <div style={styles.catalogSubheading}>
          Based on "{form.software_name}", SDSU already provides software that may cover this need:
        </div>
        <div style={styles.catalogList}>
          {catalogMatches.map((m) => (
            <CatalogCard key={m.name} match={m} />
          ))}
        </div>
        <div style={styles.catalogActions}>
          <button type="button" onClick={endAsCatalogMatch} style={styles.nextButton}>
            This covers it. I don't need to submit a request
          </button>
          <button type="button" onClick={continueAfterCatalogMatch} style={styles.continueLink}>
            None of these fit. Continue my request anyway
          </button>
        </div>
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
          Save this procurement ID before continuing. You'll need it to check on your request later.
        </div>
        <div style={styles.procurementBox}>
          <div style={styles.procurementId}>{requestId}</div>
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
            <div style={styles.headerSubtitle}>Intake form</div>
          </div>
        </div>

        {view === "question" && renderQuestion()}
        {view === "confirmSoftware" && renderConfirmSoftware()}
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
    padding: "40px 20px",
    fontFamily: "'IBM Plex Sans', sans-serif",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "520px",
    background: "#FFFFFF",
    border: "1px solid var(--line)",
    borderRadius: "14px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.12)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "18px 24px",
    background: "var(--ink)",
  },
  headerBadge: {
    background: "var(--red)",
    color: "#fff",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: "12px",
    letterSpacing: "0.06em",
    padding: "7px 11px",
    borderRadius: "6px",
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "'Source Serif 4', serif",
    fontWeight: 600,
    fontSize: "18px",
    lineHeight: 1.2,
    color: "#fff",
  },
  headerSubtitle: {
    marginTop: "3px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11.5px",
    color: "var(--stone-light)",
  },
  body: {
    padding: "22px 28px 26px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    background: "#FFFFFF",
  },
  progressRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepBadge: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--red)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  stepCount: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--stone)",
    letterSpacing: "0.02em",
  },
  dotsWrap: {
    display: "flex",
    alignItems: "center",
  },
  dotUnit: { display: "flex", alignItems: "center", flex: 1 },
  dot: {
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    border: "1.5px solid var(--line)",
    flexShrink: 0,
    transition: "background 0.25s ease, border-color 0.25s ease",
  },
  dotLine: {
    flex: 1,
    height: "1.5px",
    marginLeft: "2px",
    marginRight: "2px",
    background: "var(--line)",
    transition: "background 0.25s ease",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  sectionTitle: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--red)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderBottom: "1px solid var(--line)",
    paddingBottom: "8px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "14.5px",
    fontWeight: 600,
    color: "var(--ink)",
  },
  required: { color: "var(--red)" },
  input: {
    border: "none",
    borderBottom: "1.5px solid var(--stone-light)",
    background: "transparent",
    fontSize: "15px",
    padding: "6px 2px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: "var(--ink)",
  },
  textarea: {
    border: "1px solid var(--line)",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "14.5px",
    padding: "10px 12px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: "var(--ink)",
    minHeight: "70px",
    resize: "vertical",
  },
  pillWrap: {
    borderTop: "1px solid var(--line)",
    display: "flex",
    flexDirection: "column",
  },
  pillButton: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 4px",
    background: "transparent",
    border: "none",
    borderLeft: "3px solid transparent",
    borderBottom: "1px solid var(--line)",
    fontSize: "14.5px",
    color: "var(--ink)",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-left-color 0.15s ease, background 0.15s ease",
    fontFamily: "inherit",
  },
  pillMark: {
    color: "var(--red)",
    fontSize: "14px",
  },
  multiHint: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--red)",
    letterSpacing: "0.02em",
  },
  hint: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--stone)",
  },
  error: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--red)",
    fontWeight: 700,
  },
  submitError: {
    background: "var(--paper-alt)",
    border: "1px solid var(--red)",
    color: "var(--red)",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 600,
  },
  procurementBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    background: "var(--paper-alt)",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "12px 14px",
  },
  procurementId: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--ink)",
    wordBreak: "break-all",
  },
  copyButton: {
    flexShrink: 0,
    padding: "9px 16px",
    border: "1px solid var(--ink)",
    background: "#fff",
    color: "var(--ink)",
    fontWeight: 700,
    fontSize: "12.5px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    paddingTop: "4px",
  },
  backButton: {
    padding: "9px 16px",
    border: "1px solid var(--line)",
    background: "transparent",
    color: "var(--ink)",
    fontSize: "12.5px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  nextButton: {
    flex: 1,
    padding: "12px 16px",
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "13.5px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  navButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  submitButton: {
    flex: 1,
    padding: "12px 16px",
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "13.5px",
    letterSpacing: "0.04em",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  submitButtonDisabled: {
    background: "var(--stone)",
    borderColor: "var(--stone)",
    cursor: "not-allowed",
  },
  catalogEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--red)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  catalogHeading: {
    fontFamily: "'Source Serif 4', serif",
    fontSize: "19px",
    fontWeight: 600,
    color: "var(--ink)",
    marginTop: "-8px",
  },
  catalogSubheading: {
    fontSize: "13.5px",
    color: "var(--stone)",
    lineHeight: 1.5,
  },
  catalogList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  catalogCard: {
    borderTop: "1px solid var(--line)",
    borderRight: "1px solid var(--line)",
    borderBottom: "1px solid var(--line)",
    borderLeft: "3px solid var(--red)",
    borderRadius: "0 8px 8px 0",
    padding: "14px 16px",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  catalogCardTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--ink)",
  },
  catalogCardMeta: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--stone)",
  },
  catalogCardDesc: {
    fontSize: "13px",
    color: "var(--ink)",
    lineHeight: 1.4,
  },
  catalogCardLink: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11.5px",
    color: "var(--red)",
    fontWeight: 700,
    textDecoration: "none",
    marginTop: "4px",
  },
  identityCard: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    borderTop: "3px solid var(--red)",
    backgroundColor: "var(--paper)",
    borderLeft: "1px solid var(--rule)",
    borderRight: "1px solid var(--rule)",
    borderBottom: "1px solid var(--rule)",
    paddingTop: "16px",
    paddingRight: "18px",
    paddingBottom: "16px",
    paddingLeft: "18px",
    marginTop: "18px",
    marginBottom: "4px",
  },
  identityName: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--ink)",
    lineHeight: 1.2,
  },
  identityFunction: {
    fontSize: "14px",
    color: "var(--ink)",
    lineHeight: 1.45,
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
  catalogActions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingTop: "4px",
  },
  continueLink: {
    background: "none",
    border: "none",
    color: "var(--stone)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "12px",
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
    borderBottom: "1px solid var(--line)",
    paddingBottom: "10px",
  },
  reviewText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  reviewLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "10.5px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--stone)",
  },
  reviewValue: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--ink)",
  },
  editLink: {
    background: "none",
    border: "1px solid var(--line)",
    padding: "4px 10px",
    color: "var(--ink)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};

export default IntakeForm;
