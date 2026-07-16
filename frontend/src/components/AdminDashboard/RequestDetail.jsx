import { useState } from "react";
import { patchAdmin } from "../../api.js";
import { STATUS_ORDER, STATUS_LABELS, STATUS_DESCRIPTIONS } from "./statusConfig.js";

// ── Design tokens (matches RequesterChat.jsx / IntakeForm.jsx palette + type system) ──
const C = {
  ink: "var(--ink)",
  red: "var(--red)",
  redDark: "var(--red-dark)",
  paper: "var(--paper)",
  paperAlt: "var(--paper-alt)",
  line: "var(--line)",
  stone: "var(--stone)",
  stoneLight: "var(--stone-light)",
  white: "#ffffff",
  sans: "'IBM Plex Sans', sans-serif",
  mono: "'IBM Plex Mono', monospace",
  serif: "'Source Serif 4', serif",
};

const DEFAULT_OVERRIDES = {
  ati_flag: null,
  security_flag: null,
  integration_flag: null,
};

const DEFAULT_COMPLETIONS = {
  ati_flag: false,
  security_flag: false,
  integration_flag: false,
};

function riskColor(level) {
  if (level === "High") return C.red;
  if (level === "Medium") return "#B5650B";
  return C.stone;
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

// ── Key/value row ─────────────────────────────────────────────────────────────
function Field({ label, value }) {
  const display =
    value === null || value === undefined || value === ""
      ? <span style={{ color: C.stoneLight, fontStyle: "italic" }}>—</span>
      : Array.isArray(value)
      ? value.length === 0
        ? <span style={{ color: C.stoneLight, fontStyle: "italic" }}>—</span>
        : value.join(", ")
      : typeof value === "boolean"
      ? value ? "Yes" : "No"
      : String(value);
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>{display}</span>
    </div>
  );
}

// ── Flag row: shows computed flag + override side by side ─────────────────────
function FlagRow({
  flagKey,
  label,
  computedValue,
  computedReason,
  overrideValue,
  onToggle,
  completed,
  onToggleCompleted,
}) {
  const effective = overrideValue !== null ? overrideValue : computedValue;
  const isOverridden = overrideValue !== null;

  return (
    <div style={styles.flagRow}>
      <div style={styles.flagRowLeft}>
        <div style={styles.flagLabel}>{label}</div>
        <div style={styles.flagReason}>{computedReason}</div>
      </div>

      <div style={styles.flagRowRight}>
        {/* Computed value */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Computed</div>
          <span style={{ ...styles.flagPill, background: computedValue ? C.red : C.stone }}>
            {computedValue ? "Flagged" : "Clear"}
          </span>
        </div>

        {/* Override value */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Override</div>
          <span
            style={{
              ...styles.flagPill,
              background: isOverridden ? (overrideValue ? C.red : C.stone) : "transparent",
              color: isOverridden ? C.white : C.stone,
              border: isOverridden ? "none" : `1.5px dashed ${C.line}`,
            }}
          >
            {isOverridden ? (overrideValue ? "Flagged" : "Clear") : "None"}
          </span>
        </div>

        {/* Effective (what will be used) */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Effective</div>
          <span style={{ ...styles.flagPill, background: effective ? C.red : C.stone }}>
            {effective ? "Flagged" : "Clear"}
          </span>
        </div>

        {/* Review completion — only meaningful while the review actually applies */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Review</div>
          <button
            data-testid={`complete-${label.replace(/\s+/g, '-').toLowerCase()}`}
            type="button"
            disabled={!effective}
            title={
              !effective
                ? "This review does not apply (flag is clear)"
                : completed
                ? "Click to mark this review as still remaining"
                : "Click to mark this review as completed"
            }
            style={{
              ...styles.completeButton,
              background: effective && completed ? "#2E7D32" : C.white,
              color: effective && completed ? C.white : C.ink,
              border: effective && completed ? "none" : `1.5px solid ${C.line}`,
              opacity: effective ? 1 : 0.45,
              cursor: effective ? "pointer" : "not-allowed",
            }}
            onClick={() => onToggleCompleted(flagKey)}
          >
            {completed ? "Completed ✓" : "Remaining"}
          </button>
        </div>

        {/* Toggle button */}
        <button
          data-testid={`toggle-${label.replace(/\s+/g, '-').toLowerCase()}`}
          style={{
            ...styles.toggleButton,
            background: overrideValue === true ? C.red : overrideValue === false ? C.stone : C.white,
            color: overrideValue !== null ? C.white : C.ink,
            border: overrideValue !== null ? "none" : `1.5px solid ${C.line}`,
          }}
          onClick={() => onToggle(flagKey)}
          type="button"
        >
          {overrideValue === null
            ? "Override"
            : overrideValue
            ? "Set → Clear"
            : "Set → Flag"}
        </button>
      </div>
    </div>
  );
}

// ── Review document sub-section ───────────────────────────────────────────────
// Renders one review type's documents (or its status message) inside the panel.
function ReviewTypeRow({ label, reviewSection }) {
  const renderContent = () => {
    if (!reviewSection) {
      return (
        <span style={rdStyles.pendingText}>
          Review in progress, gathering documents
        </span>
      );
    }

    const { status, message, files = [] } = reviewSection;

    if (status === "pending") {
      return <span style={rdStyles.pendingText}>{message || "Review in progress, gathering documents"}</span>;
    }

    if (status === "no_docs") {
      return <span style={rdStyles.noDocsText}>{message}</span>;
    }

    // status === "complete"
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {files.map((f) => (
          <a
            key={f.name}
            href={f.url}
            download={f.name}
            target="_blank"
            rel="noreferrer"
            aria-label={`Download ${f.name}`}
            style={rdStyles.downloadLink}
          >
            {f.name} ↓
          </a>
        ))}
      </div>
    );
  };

  return (
    <div style={rdStyles.reviewRow}>
      <span style={rdStyles.reviewLabel}>{label}</span>
      <div style={rdStyles.reviewContent}>{renderContent()}</div>
    </div>
  );
}

const rdStyles = {
  reviewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    padding: "8px 0",
    borderBottom: "1px solid var(--paper-alt)",
    fontSize: "13px",
  },
  reviewLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11.5px",
    color: "var(--stone)",
    flexShrink: 0,
    width: "110px",
    paddingTop: "1px",
  },
  reviewContent: {
    flex: 1,
    textAlign: "right",
  },
  pendingText: {
    fontSize: "12px",
    color: "var(--stone-light)",
    fontStyle: "italic",
  },
  noDocsText: {
    fontSize: "12px",
    color: "#B5650B",
    fontStyle: "italic",
  },
  downloadLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "12px",
    fontFamily: "'IBM Plex Mono', monospace",
    color: "var(--red)",
    textDecoration: "none",
    fontWeight: 600,
  },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function RequestDetail({ request, onClose, onSaved }) {
  const requestor = request.requestor || {};
  const it_review = request.it_review || {};
  const flags = request.flags || {};
  const admin = request.admin || {};
  const review_docs = request.review_docs || {};

  // Local override state — starts from whatever is already saved
  const [overrides, setOverrides] = useState({
    ...DEFAULT_OVERRIDES,
    ...(admin.overrides || {}),
  });
  const [completions, setCompletions] = useState({
    ...DEFAULT_COMPLETIONS,
    ...(admin.review_completions || {}),
  });
  const [overrideReason, setOverrideReason] = useState(admin.override_reason || "");
  const [overriddenBy, setOverriddenBy] = useState(admin.overridden_by || "");
  const [adminNotes, setAdminNotes] = useState(admin.admin_notes || "");
  const [status, setStatus] = useState(request.status || "Submitted");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasOverride =
    overrides.ati_flag !== null ||
    overrides.security_flag !== null ||
    overrides.integration_flag !== null;

  // Cycle override for a flag: null → true → false → null
  function handleToggle(key) {
    setOverrides((prev) => {
      const cur = prev[key];
      const next = cur === null ? true : cur === true ? false : null;
      return { ...prev, [key]: next };
    });
  }

  // Mark a review Completed / Remaining. The stored value survives a flag
  // being overridden off and back on, so no progress is silently lost.
  function handleToggleCompleted(key) {
    setCompletions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function validate() {
    if (hasOverride && overrideReason.trim() === "") {
      return "An override reason is required when changing any flag.";
    }
    if (hasOverride && overriddenBy.trim() === "") {
      return "Please enter the name or ID of the reviewer making this override.";
    }
    return "";
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSaving(true);

    // Backend expects top-level fields (not nested under "admin").
    const payload = {
      overrides,
      review_completions: completions,
      override_reason: overrideReason.trim(),
      overridden_by: overriddenBy.trim(),
      admin_notes: adminNotes.trim(),
      status,
    };

    try {
      const updated = await patchAdmin(request.request_id, payload);
      onSaved(updated);
    } catch (err) {
      setError(err.message || "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div style={styles.panel} role="dialog" aria-label="Request detail">
        {/* Panel header */}
        <div style={styles.panelHeader}>
          <div>
            <div style={styles.panelTitle}>{requestor.software_name}</div>
            <div style={styles.panelSubtitle}>
              {requestor.requested_for_name} · {requestor.department}
            </div>
            <div style={styles.panelProcurementId}>
              Procurement ID: <span style={styles.panelProcurementIdValue}>{request.request_id}</span>
            </div>
          </div>
          <button style={styles.closeButton} onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={styles.panelBody}>

          {/* ── Status ── */}
          <Section title="Status">
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span
                style={{
                  ...styles.statusBadge,
                  background: C.stone,
                }}
              >
                {STATUS_LABELS[status] || status}
              </span>
            </div>
            <select
              style={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Update status"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <div style={styles.statusDescription}>
              {STATUS_DESCRIPTIONS[status]}
            </div>
            <div style={styles.overrideNote}>
              Changing the status here takes effect when you click Save changes below.
            </div>
          </Section>

          {/* ── Requestor ── */}
          <Section title="Requestor Information">
            <Field label="Name" value={requestor.requested_for_name} />
            <Field label="Phone" value={requestor.requested_for_phone} />
            <Field label="Email" value={requestor.requested_for_email} />
            <Field label="Department" value={requestor.department} />
            <Field label="College / Division" value={requestor.college_division} />
            <Field label="User types" value={requestor.user_types} />
            <Field label="Scope of usage" value={requestor.scope_of_usage} />
            <Field label="Software name" value={requestor.software_name} />
            <Field label="Use description" value={requestor.use_description} />
            <Field label="Vendor website" value={requestor.vendor_website} />
            <Field label="Software term" value={requestor.software_term} />
            <Field label="Estimated spend" value={requestor.estimated_spend ? `$${requestor.estimated_spend.toLocaleString()}` : null} />
            <Field label="Purchase type" value={requestor.purchase_type} />
            <Field label="Funding source" value={requestor.funding_source} />
            <Field label="Existing requisition" value={requestor.existing_requisition} />
            <Field label="Needs install help" value={requestor.needs_install_help} />
            <Field label="Notify list" value={requestor.notify_list} />
            <Field label="Additional details" value={requestor.additional_details} />
          </Section>

          {/* ── IT Review ── */}
          <Section title="IT Review Answers">
            <Field label="Estimated users" value={it_review.estimated_users} />
            <Field label="Interaction method" value={it_review.interaction_method} />
            <Field label="Software category" value={it_review.software_category} />
            <Field label="Shares data with campus system" value={it_review.shares_data_with_campus_system} />
            <Field label="Integration explanation" value={it_review.integration_explanation} />
            <Field label="SSO capable" value={it_review.sso_capable} />
            <Field label="Level 1 data" value={it_review.level_1_data} />
            <Field label="Level 1 categories" value={it_review.level_1_categories} />
            <Field label="Level 2 data" value={it_review.level_2_data} />
            <Field label="Level 2 categories" value={it_review.level_2_categories} />
            <Field label="Other data category" value={it_review.other_data_category} />
            <Field label="Compliance requirements" value={it_review.compliance_requirements} />
            <Field label="Compliance note" value={it_review.compliance_note} />
            <Field label="Vendor privacy policy" value={it_review.vendor_privacy_policy_url} />
          </Section>

          {/* ── Review Documents ── */}
          <Section title="Review Documents">
            <div style={{ marginBottom: "8px", fontSize: "12.5px", color: "var(--stone)", lineHeight: 1.5 }}>
              Documents uploaded by ATI, Security (ITSO), and Integration reviewers.
              Download links expire after 1 hour — refresh the page for a new link if needed.
            </div>
            <ReviewTypeRow label="ATI Docs"         reviewSection={review_docs.ati} />
            <ReviewTypeRow label="ITSO Docs"        reviewSection={review_docs.itso} />
            <ReviewTypeRow label="Integration Docs" reviewSection={review_docs.integration} />
          </Section>

          {/* ── Computed Flags ── */}
          <Section title="Computed Flags">
            <div style={{ marginBottom: "10px" }}>
              <span style={styles.riskLine}>
                Risk level:{" "}
                <span style={{ fontWeight: 700, color: riskColor(flags.risk_level) }}>
                  {flags.risk_level || "Pending"}
                </span>
              </span>
            </div>
            <FlagRow
              flagKey="ati_flag"
              label="ATI Review"
              computedValue={flags.ati_flag === true}
              computedReason={flags.ati_flag_reason || "Not computed yet"}
              overrideValue={overrides.ati_flag}
              onToggle={handleToggle}
              completed={completions.ati_flag}
              onToggleCompleted={handleToggleCompleted}
            />
            <FlagRow
              flagKey="security_flag"
              label="ITSO Review"
              computedValue={flags.security_flag === true}
              computedReason={flags.security_flag_reason || "Not computed yet"}
              overrideValue={overrides.security_flag}
              onToggle={handleToggle}
              completed={completions.security_flag}
              onToggleCompleted={handleToggleCompleted}
            />
            <FlagRow
              flagKey="integration_flag"
              label="Integration Review"
              computedValue={flags.integration_flag === true}
              computedReason={flags.integration_flag_reason || "Not computed yet"}
              overrideValue={overrides.integration_flag}
              onToggle={handleToggle}
              completed={completions.integration_flag}
              onToggleCompleted={handleToggleCompleted}
            />
          </Section>

          {/* ── Override form ── */}
          <Section title="Override & Admin Notes">
            <div style={styles.overrideNote}>
              Use the toggle buttons above to override computed flags. Overrides require a reason
              and reviewer identification. The computed flag is always shown alongside the override
              so nothing is silently overwritten.
            </div>

            <label style={styles.formLabel}>
              Override reason{hasOverride && <span style={{ color: C.red }}> *</span>}
            </label>
            <textarea
              style={styles.textarea}
              rows={3}
              placeholder="Explain why you are overriding one or more computed flags…"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              aria-label="Override reason"
            />

            <label style={styles.formLabel}>
              Reviewer name / ID{hasOverride && <span style={{ color: C.red }}> *</span>}
            </label>
            <input
              style={styles.input}
              placeholder="e.g. jdoe or John Doe"
              value={overriddenBy}
              onChange={(e) => setOverriddenBy(e.target.value)}
              aria-label="Reviewer name or ID"
            />

            <label style={styles.formLabel}>Admin notes</label>
            <textarea
              style={styles.textarea}
              rows={3}
              placeholder="Internal notes visible only to reviewers…"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              aria-label="Admin notes"
            />

            {error && <div style={styles.errorMsg}>{error}</div>}

            <div style={styles.saveRow}>
              <button style={styles.cancelButton} onClick={onClose} type="button">
                Cancel
              </button>
              <button
                style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}
                onClick={handleSave}
                disabled={saving}
                type="button"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(26, 26, 26, 0.45)",
    zIndex: 100,
  },
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    width: "min(560px, 100vw)",
    height: "100vh",
    background: C.white,
    zIndex: 101,
    display: "flex",
    flexDirection: "column",
    boxShadow: "-4px 0 32px rgba(0,0,0,0.18)",
    fontFamily: C.sans,
    color: C.ink,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "18px 24px",
    background: C.ink,
    color: C.white,
    flexShrink: 0,
  },
  panelTitle: {
    fontFamily: C.serif,
    fontWeight: 600,
    fontSize: "18px",
    lineHeight: 1.2,
  },
  panelSubtitle: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    color: C.stoneLight,
    marginTop: "4px",
  },
  panelProcurementId: {
    fontFamily: C.mono,
    fontSize: "10.5px",
    color: C.stoneLight,
    marginTop: "6px",
  },
  panelProcurementIdValue: {
    color: C.white,
    userSelect: "all",
  },
  closeButton: {
    background: "transparent",
    border: "none",
    color: C.white,
    fontSize: "18px",
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 4px",
  },
  panelBody: {
    overflowY: "auto",
    flex: 1,
    padding: "0 0 32px",
  },
  section: {
    padding: "18px 24px",
    borderBottom: `1px solid ${C.line}`,
  },
  sectionTitle: {
    fontFamily: C.mono,
    fontWeight: 700,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: C.red,
    marginBottom: "14px",
    paddingBottom: "8px",
    borderBottom: `1px solid ${C.line}`,
  },
  field: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "6px 0",
    borderBottom: `1px solid ${C.paperAlt}`,
    fontSize: "13px",
  },
  fieldLabel: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    color: C.stone,
    flexShrink: 0,
    width: "170px",
  },
  fieldValue: {
    color: C.ink,
    textAlign: "right",
    wordBreak: "break-word",
  },
  riskLine: {
    fontFamily: C.mono,
    fontSize: "12px",
    color: C.stone,
  },
  flagRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    padding: "12px 0",
    borderBottom: `1px solid ${C.paperAlt}`,
    flexWrap: "wrap",
  },
  flagRowLeft: {
    flex: "1 1 140px",
  },
  flagLabel: {
    fontWeight: 600,
    fontSize: "13px",
    color: C.ink,
  },
  flagReason: {
    fontFamily: C.mono,
    fontSize: "11px",
    color: C.stone,
    marginTop: "3px",
  },
  flagRowRight: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  flagCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
  },
  flagCellLabel: {
    fontFamily: C.mono,
    fontSize: "9.5px",
    color: C.stoneLight,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  flagPill: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "3px",
    fontFamily: C.mono,
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: C.white,
  },
  completeButton: {
    padding: "4px 10px",
    borderRadius: "5px",
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    fontFamily: C.mono,
    whiteSpace: "nowrap",
  },
  toggleButton: {
    padding: "6px 12px",
    borderRadius: "5px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    cursor: "pointer",
    fontFamily: C.mono,
    whiteSpace: "nowrap",
  },
  overrideNote: {
    fontSize: "12.5px",
    color: C.stone,
    background: C.paper,
    border: `1px solid ${C.line}`,
    padding: "12px 14px",
    borderRadius: "6px",
    marginBottom: "16px",
    lineHeight: 1.5,
  },
  formLabel: {
    display: "block",
    fontFamily: C.mono,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: C.ink,
    marginBottom: "6px",
    marginTop: "14px",
  },
  statusBadge: {
    display: "inline-block",
    padding: "4px 11px",
    borderRadius: "4px",
    fontFamily: C.mono,
    fontSize: "11.5px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.white,
  },
  statusDescription: {
    marginTop: "8px",
    fontSize: "12.5px",
    color: C.stone,
    lineHeight: 1.5,
  },
  select: {
    width: "100%",
    padding: "9px 10px",
    borderRadius: "6px",
    border: `1.5px solid ${C.line}`,
    fontSize: "13px",
    fontFamily: C.sans,
    background: C.white,
    color: C.ink,
    cursor: "pointer",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: `1.5px solid ${C.line}`,
    fontSize: "13.5px",
    fontFamily: C.sans,
    color: C.ink,
    resize: "vertical",
    boxSizing: "border-box",
    outline: "none",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: `1.5px solid ${C.line}`,
    fontSize: "13.5px",
    fontFamily: C.sans,
    color: C.ink,
    boxSizing: "border-box",
    outline: "none",
  },
  errorMsg: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "6px",
    background: "#FDECEC",
    color: C.red,
    fontSize: "13px",
    fontWeight: 600,
    border: `1px solid ${C.red}`,
  },
  saveRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "18px",
  },
  cancelButton: {
    padding: "10px 18px",
    borderRadius: "6px",
    border: `1.5px solid ${C.line}`,
    background: C.white,
    color: C.ink,
    fontSize: "12.5px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    cursor: "pointer",
    fontFamily: C.mono,
  },
  saveButton: {
    padding: "10px 18px",
    borderRadius: "6px",
    border: "none",
    background: C.ink,
    color: C.white,
    fontSize: "12.5px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    cursor: "pointer",
    fontFamily: C.mono,
  },
};
