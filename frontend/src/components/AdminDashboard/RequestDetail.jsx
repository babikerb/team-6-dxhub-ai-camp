import { useEffect, useRef, useState } from "react";
import { getRequest, patchAdmin, regenerateSecurityReport } from "../../api.js";
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
  ai_flag: null,
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
  reviewable = true,
}) {
  const effective = overrideValue !== null ? overrideValue : computedValue;
  const isOverridden = overrideValue !== null;
  const testIdLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

        {/* Review completion — AI/ADS is an inventory marker, not a review queue. */}
        <div style={styles.flagCell}>
          <div style={styles.flagCellLabel}>Review</div>
          {reviewable ? (
            <button
              data-testid={`complete-${testIdLabel}`}
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
          ) : (
            <span style={{ ...styles.completeButton, color: C.stone, border: `1.5px solid ${C.line}` }}>
              Tracking only
            </span>
          )}
        </div>

        {/* Toggle button */}
        <button
          data-testid={`toggle-${testIdLabel}`}
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

// ── Security Review risk badge ────────────────────────────────────────────────
function riskTierColor(tier) {
  if (tier === "High") return C.red;
  if (tier === "Medium") return "#B5650B";
  return C.stone;
}

const SOURCE_LABELS = {
  admin_attached: "attached by reviewer",
  requester_provided: "provided by requester",
  auto_search: "found via web search",
  not_found: "not found",
};

// ── One row in "Sources checked": link + how it was obtained ──────────────────
function SourceRow({ source }) {
  const label = source.doc_type.replace(/_/g, " ");
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <span style={styles.fieldValue}>
        {source.fetched ? (
          <a href={source.url} target="_blank" rel="noreferrer" style={{ color: C.red }}>
            {source.url}
          </a>
        ) : (
          <span style={{ color: C.stoneLight, fontStyle: "italic" }}>
            {source.url ? "found but could not be fetched" : "not available"}
          </span>
        )}
        <span style={{ marginLeft: "8px", fontSize: "10.5px", color: C.stoneLight }}>
          ({SOURCE_LABELS[source.source] || source.source})
        </span>
      </span>
    </div>
  );
}


// ── Attach Documents: reviewer can paste a link the requester didn't provide,
// or that the report's auto-search couldn't find (HECVAT/SOC 2 are never
// asked of the requester, only auto-searched — this is the only way to add
// them). Saved links take priority over requester-provided ones next time
// the report generates. ─────────────────────────────────────────────────────
const DOC_TYPE_LABELS = {
  privacy_policy: "Privacy policy",
  terms_of_service: "Terms of service",
  vpat: "VPAT / accessibility doc",
  hecvat: "HECVAT",
  soc2: "SOC 2 report",
};

function AttachDocumentsForm({ attachedDocuments, onSaveAndRegenerate, saving }) {
  const [urls, setUrls] = useState({
    privacy_policy: attachedDocuments?.privacy_policy || "",
    terms_of_service: attachedDocuments?.terms_of_service || "",
    vpat: attachedDocuments?.vpat || "",
    hecvat: attachedDocuments?.hecvat || "",
    soc2: attachedDocuments?.soc2 || "",
  });

  function setUrl(docType, value) {
    setUrls((prev) => ({ ...prev, [docType]: value }));
  }

  function handleSave() {
    const payload = {};
    for (const [docType, value] of Object.entries(urls)) {
      const trimmed = value.trim();
      payload[docType] = trimmed === "" ? null : trimmed;
    }
    onSaveAndRegenerate(payload);
  }

  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={styles.formLabel}>Attach documents (optional)</div>
      <div style={{ ...styles.overrideNote, marginBottom: "10px" }}>
        Paste a link for anything the requester didn't provide, or that the automatic search
        couldn't find — HECVAT and SOC 2 are never asked of the requester, only searched for.
        Saved links are used the next time the report generates.
      </div>
      {Object.entries(DOC_TYPE_LABELS).map(([docType, label]) => (
        <div key={docType} style={{ marginBottom: "8px" }}>
          <label style={{ ...styles.formLabel, marginTop: 0 }}>{label}</label>
          <input
            style={styles.input}
            type="text"
            placeholder="https://..."
            value={urls[docType]}
            onChange={(e) => setUrl(docType, e.target.value)}
            disabled={saving}
          />
        </div>
      ))}
      <button
        style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}
        onClick={handleSave}
        disabled={saving}
        type="button"
      >
        {saving ? "Saving…" : "Save & Regenerate"}
      </button>
    </div>
  );
}

// ── Security Review panel: shown only when flags.security_flag is true ────────
function SecurityReviewPanel({ securityReview, attachedDocuments, generating, onRegenerate, onSaveAndRegenerate }) {
  const [copied, setCopied] = useState(false);
  const status = securityReview?.status;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(securityReview.servicenow_comment || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — silently ignore, the text is still selectable
    }
  }

  return (
    <Section title="Security Review (Automated)">
      {(generating || status === "pending") && (
        <div style={styles.overrideNote}>Generating security report — searching the web for privacy policy, Terms of Service, VPAT, and HECVAT, then running the risk review. This can take up to two minutes.</div>
      )}

      {!generating && status === "failed" && (
        <div style={styles.errorMsg}>
          Report generation failed: {securityReview.error || "unknown error"}
        </div>
      )}

      {!generating && (!status || status === "failed") && (
        <button style={styles.saveButton} onClick={onRegenerate} type="button">
          {status === "failed" ? "Retry" : "Generate report"}
        </button>
      )}

      {!generating && status === "complete" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span
              style={{
                ...styles.statusBadge,
                background: riskTierColor(securityReview.risk_tier),
              }}
            >
              {securityReview.risk_score}/10 · {securityReview.risk_tier}
            </span>
            {securityReview.hecvat_provided === false && (
              <span style={{ ...styles.statusBadge, background: C.stone }}>No HECVAT</span>
            )}
          </div>

          <div style={styles.formLabel}>Report</div>
          <div style={styles.reportBox}>{securityReview.report_markdown}</div>

          <div style={{ ...styles.formLabel, marginTop: "16px" }}>
            ServiceNow risk summary comment
          </div>
          <div style={styles.reportBox}>{securityReview.servicenow_comment}</div>
          <button style={{ ...styles.cancelButton, marginTop: "8px" }} onClick={handleCopy} type="button">
            {copied ? "Copied ✓" : "Copy comment"}
          </button>

          {Array.isArray(securityReview.sources) && securityReview.sources.length > 0 && (
            <>
              <div style={{ ...styles.formLabel, marginTop: "16px" }}>Sources checked</div>
              {securityReview.sources.map((s) => (
                <SourceRow key={s.doc_type} source={s} />
              ))}
            </>
          )}

          {Array.isArray(securityReview.s3_archived) && securityReview.s3_archived.length > 0 && (
            <>
              <div style={{ ...styles.formLabel, marginTop: "16px" }}>
                Archived to S3 (DataStored/{"{"}request_id{"}"}/...)
              </div>
              <div style={styles.reportBox}>
                {securityReview.s3_archived.map((key) => (
                  <div key={key}>{key}</div>
                ))}
              </div>
            </>
          )}

          <button style={{ ...styles.saveButton, marginTop: "16px" }} onClick={onRegenerate} type="button">
            Regenerate (same documents)
          </button>

          <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: `1px solid ${C.line}` }}>
            <AttachDocumentsForm
              attachedDocuments={attachedDocuments}
              onSaveAndRegenerate={onSaveAndRegenerate}
              saving={generating}
            />
          </div>
        </>
      )}

      {/* Also offer to attach documents before the first report ever runs. */}
      {!generating && (!status || status === "failed") && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${C.line}` }}>
          <AttachDocumentsForm
            attachedDocuments={attachedDocuments}
            onSaveAndRegenerate={onSaveAndRegenerate}
            saving={generating}
          />
        </div>
      )}
    </Section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RequestDetail({ request, onClose, onSaved, onRefreshed }) {
  const [record, setRecord] = useState(request);
  const [generatingReport, setGeneratingReport] = useState(false);
  const pollRef = useRef(null);

  // Reset local state when a different request is opened.
  useEffect(() => {
    setRecord(request);
  }, [request.request_id]);

  // Poll while a report is generating in the background (auto-triggered
  // right after chatbot submission), so the panel updates itself without
  // the admin needing to close/reopen or hit refresh.
  useEffect(() => {
    if (record.security_review?.status !== "pending") return undefined;

    pollRef.current = setInterval(async () => {
      try {
        const updated = await getRequest(record.request_id);
        setRecord(updated);
        if (updated.security_review?.status !== "pending") {
          onRefreshed?.(updated);
        }
      } catch {
        // transient fetch error — just try again on the next tick
      }
    }, 4000);

    return () => clearInterval(pollRef.current);
  }, [record.request_id, record.security_review?.status]);

  async function handleRegenerateReport() {
    setGeneratingReport(true);
    try {
      const updated = await regenerateSecurityReport(record.request_id);
      setRecord(updated);
      onRefreshed?.(updated);
    } catch (err) {
      setRecord((r) => ({
        ...r,
        security_review: { status: "failed", error: err.message || "Request failed" },
      }));
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleSaveDocumentsAndRegenerate(attachedDocuments) {
    setGeneratingReport(true);
    try {
      const savedRecord = await patchAdmin(record.request_id, { attached_documents: attachedDocuments });
      setRecord(savedRecord);
      const updated = await regenerateSecurityReport(record.request_id);
      setRecord(updated);
      onRefreshed?.(updated);
    } catch (err) {
      setRecord((r) => ({
        ...r,
        security_review: { status: "failed", error: err.message || "Request failed" },
      }));
    } finally {
      setGeneratingReport(false);
    }
  }

  const requestor = record.requestor || {};
  const it_review = record.it_review || {};
  const flags = record.flags || {};
  const admin = record.admin || {};

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
  const [status, setStatus] = useState(record.status || "Submitted");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasOverride =
    overrides.ati_flag !== null ||
    overrides.security_flag !== null ||
    overrides.integration_flag !== null ||
    overrides.ai_flag !== null;

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
      const updated = await patchAdmin(record.request_id, payload);
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
              Procurement ID: <span style={styles.panelProcurementIdValue}>{record.request_id}</span>
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
            <FlagRow
              flagKey="ai_flag"
              label="AI / ADS"
              computedValue={flags.ai_flag === true}
              computedReason={flags.ai_flag_reason || "Not computed yet"}
              overrideValue={overrides.ai_flag}
              onToggle={handleToggle}
              reviewable={false}
            />
          </Section>

          {/* ── Security Review (Automated) — only when flagged ── */}
          {flags.security_flag === true && (
            <SecurityReviewPanel
              securityReview={record.security_review}
              attachedDocuments={admin.attached_documents}
              generating={generatingReport}
              onRegenerate={handleRegenerateReport}
              onSaveAndRegenerate={handleSaveDocumentsAndRegenerate}
            />
          )}

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
  reportBox: {
    whiteSpace: "pre-wrap",
    background: C.paper,
    border: `1px solid ${C.line}`,
    borderRadius: "6px",
    padding: "12px 14px",
    fontSize: "12.5px",
    fontFamily: C.mono,
    lineHeight: 1.6,
    color: C.ink,
    maxHeight: "340px",
    overflowY: "auto",
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
