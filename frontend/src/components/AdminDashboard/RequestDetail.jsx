import { useState } from "react";

// ── Color tokens (matches RequesterChat.jsx palette) ──────────────────────────
const C = {
  red: "#C8102E",
  dark: "#1A1A1A",
  darkGrey: "#3A3A3A",
  white: "#ffffff",
  pageBg: "#F2F2F2",
  lightGrey: "#FAFAFA",
  borderGrey: "#EDEDED",
  inputBorder: "#DDD",
  mutedText: "#666",
  subtleText: "#B3B3B3",
  font: "'Segoe UI', Arial, sans-serif",
};

function riskColor(level) {
  if (level === "High") return C.red;
  if (level === "Medium") return "#E87C00";
  return C.darkGrey;
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
      ? <span style={{ color: C.subtleText, fontStyle: "italic" }}>—</span>
      : Array.isArray(value)
      ? value.length === 0
        ? <span style={{ color: C.subtleText, fontStyle: "italic" }}>—</span>
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
function FlagRow({ label, computedValue, computedReason, overrideValue, onToggle }) {
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
          <span style={{ ...styles.flagPill, background: computedValue ? C.red : C.darkGrey }}>
            {computedValue ? "Flagged" : "Clear"}
          </span>
        </div>

        {/* Override value */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Override</div>
          <span
            style={{
              ...styles.flagPill,
              background: isOverridden ? (overrideValue ? C.red : C.darkGrey) : "transparent",
              color: isOverridden ? C.white : C.mutedText,
              border: isOverridden ? "none" : `1.5px dashed ${C.inputBorder}`,
            }}
          >
            {isOverridden ? (overrideValue ? "Flagged" : "Clear") : "None"}
          </span>
        </div>

        {/* Effective (what will be used) */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Effective</div>
          <span style={{ ...styles.flagPill, background: effective ? C.red : C.darkGrey }}>
            {effective ? "Flagged" : "Clear"}
          </span>
        </div>

        {/* Toggle button */}
        <button
          data-testid={`toggle-${label.replace(/\s+/g, '-').toLowerCase()}`}
          style={{
            ...styles.toggleButton,
            background: overrideValue === true ? C.red : overrideValue === false ? C.darkGrey : C.white,
            color: overrideValue !== null ? C.white : C.dark,
            border: overrideValue !== null ? "none" : `1.5px solid ${C.inputBorder}`,
          }}
          onClick={() => onToggle(label)}
          type="button"
        >
          {overrideValue === null
            ? "Override"
            : overrideValue
            ? "Set \u2192 Clear"
            : "Set \u2192 Flag"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RequestDetail({ request, onClose, onSaved }) {
  const { requestor, it_review, flags, admin } = request;

  // Local override state — starts from whatever is already saved
  const [overrides, setOverrides] = useState({ ...admin.overrides });
  const [overrideReason, setOverrideReason] = useState(admin.override_reason || "");
  const [overriddenBy, setOverriddenBy] = useState(admin.overridden_by || "");
  const [adminNotes, setAdminNotes] = useState(admin.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasOverride =
    overrides.ati_flag !== null ||
    overrides.security_flag !== null ||
    overrides.integration_flag !== null;

  // Cycle override for a flag: null → true → false → null
  function handleToggle(label) {
    const key =
      label === "ATI Review"
        ? "ati_flag"
        : label === "Security Review"
        ? "security_flag"
        : "integration_flag";
    setOverrides((prev) => {
      const cur = prev[key];
      const next = cur === null ? true : cur === true ? false : null;
      return { ...prev, [key]: next };
    });
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

    const payload = {
      admin: {
        overrides,
        override_reason: overrideReason.trim(),
        overridden_by: overriddenBy.trim(),
        admin_notes: adminNotes.trim(),
      },
    };

    try {
      // Phase 2: swap this URL for the real endpoint
      // const res = await fetch(`/requests/${request.request_id}/admin`, {
      //   method: "PATCH",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(payload),
      // });
      // const updated = await res.json();

      // Phase 1: simulate a successful save with mock data
      await new Promise((r) => setTimeout(r, 400));
      const updated = {
        ...request,
        admin: {
          overrides,
          override_reason: overrideReason.trim(),
          overridden_by: overriddenBy.trim(),
          admin_notes: adminNotes.trim(),
        },
        updated_at: new Date().toISOString(),
      };

      onSaved(updated);
    } catch {
      setError("Save failed. Please try again.");
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
          </div>
          <button style={styles.closeButton} onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={styles.panelBody}>

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

          {/* ── Computed Flags ── */}
          <Section title="Computed Flags">
            <div style={{ marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: C.mutedText }}>
                Risk level:{" "}
                <span style={{ fontWeight: 700, color: riskColor(flags.risk_level) }}>
                  {flags.risk_level}
                </span>
              </span>
            </div>
            <FlagRow
              label="ATI Review"
              computedValue={flags.ati_flag}
              computedReason={flags.ati_flag_reason}
              overrideValue={overrides.ati_flag}
              onToggle={handleToggle}
            />
            <FlagRow
              label="Security Review"
              computedValue={flags.security_flag}
              computedReason={flags.security_flag_reason}
              overrideValue={overrides.security_flag}
              onToggle={handleToggle}
            />
            <FlagRow
              label="Integration Review"
              computedValue={flags.integration_flag}
              computedReason={flags.integration_flag_reason}
              overrideValue={overrides.integration_flag}
              onToggle={handleToggle}
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
    background: "rgba(0,0,0,0.35)",
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
    boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
    fontFamily: C.font,
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "16px 20px",
    background: C.dark,
    color: C.white,
    flexShrink: 0,
  },
  panelTitle: { fontWeight: 700, fontSize: "15px" },
  panelSubtitle: { fontSize: "12px", color: C.subtleText, marginTop: "2px" },
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
    padding: "16px 20px",
    borderBottom: `1px solid ${C.borderGrey}`,
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: C.dark,
    marginBottom: "12px",
  },
  field: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "5px 0",
    borderBottom: `1px solid ${C.borderGrey}`,
    fontSize: "13px",
  },
  fieldLabel: {
    color: C.mutedText,
    flexShrink: 0,
    width: "170px",
  },
  fieldValue: {
    color: C.dark,
    textAlign: "right",
    wordBreak: "break-word",
  },
  flagRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    padding: "10px 0",
    borderBottom: `1px solid ${C.borderGrey}`,
    flexWrap: "wrap",
  },
  flagRowLeft: {
    flex: "1 1 140px",
  },
  flagLabel: {
    fontWeight: 600,
    fontSize: "13px",
    color: C.dark,
  },
  flagReason: {
    fontSize: "11px",
    color: C.mutedText,
    marginTop: "2px",
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
    fontSize: "10px",
    color: C.subtleText,
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  },
  flagPill: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
    color: C.white,
  },
  toggleButton: {
    padding: "5px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: C.font,
    whiteSpace: "nowrap",
  },
  overrideNote: {
    fontSize: "12px",
    color: C.mutedText,
    background: C.lightGrey,
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "14px",
    lineHeight: 1.5,
  },
  formLabel: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: C.dark,
    marginBottom: "6px",
    marginTop: "12px",
  },
  textarea: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "8px",
    border: `1.5px solid ${C.inputBorder}`,
    fontSize: "13px",
    fontFamily: C.font,
    resize: "vertical",
    boxSizing: "border-box",
    outline: "none",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "8px",
    border: `1.5px solid ${C.inputBorder}`,
    fontSize: "13px",
    fontFamily: C.font,
    boxSizing: "border-box",
    outline: "none",
  },
  errorMsg: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "8px",
    background: "#FFECEC",
    color: C.red,
    fontSize: "13px",
    fontWeight: 600,
    border: `1px solid ${C.red}`,
  },
  saveRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "16px",
  },
  cancelButton: {
    padding: "10px 18px",
    borderRadius: "8px",
    border: `1.5px solid ${C.inputBorder}`,
    background: C.white,
    color: C.dark,
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: C.font,
  },
  saveButton: {
    padding: "10px 18px",
    borderRadius: "8px",
    border: "none",
    background: C.dark,
    color: C.white,
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: C.font,
  },
};
