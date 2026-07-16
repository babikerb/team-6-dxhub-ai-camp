import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRequest,
  getReviewDocs,
  uploadReviewDoc,
  retrieveAtiDocuments,
  generateAtiReport,
  regenerateSecurityReport,
} from "../../api.js";

// ── Design tokens (matches AdminDashboard / RequesterChat / IntakeForm) ──
const C = {
  ink: "var(--ink)",
  red: "var(--red)",
  paper: "var(--paper)",
  paperAlt: "var(--paper-alt)",
  line: "var(--line)",
  stone: "var(--stone)",
  stoneLight: "var(--stone-light)",
  white: "#ffffff",
  sans: "'IBM Plex Sans', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

// Markdown isn't rendered in this panel, and the two generators disagree about
// it: the ATI report is plain text by contract, the security report returns
// report_markdown. Strip it so a reviewer never reads literal ** or ##.
function toPlainText(s) {
  return String(s || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/(?<![\w*])\*(?=\S)([^*\n]+?)\*(?![\w*])/g, "$1");
}

// One screen serves all three reviews; only this config differs.
//
// `expected` is the checklist of documents a reviewer looks for. It's listed
// even when the file is absent, because "no VPAT" is itself the finding — a
// column that only showed what happened to be in S3 would render an empty box
// and say nothing. Files in S3 that aren't on the checklist still appear (see
// extraFiles) so nothing is hidden.
//
// `readReport` adapts each workstream's record shape to what column 2 renders,
// so ATI and Security can differ (they do: different fields, different owners)
// without the component knowing which is which.
export const REVIEW_TYPES = {
  ati: {
    key: "ati",
    title: "ATI Dashboard",
    subtitle: "Accessibility review (VPAT / ACR)",
    expected: [
      { id: "vpat", label: "VPAT / ACR" },
      { id: "privacy_policy", label: "Privacy policy" },
      { id: "terms_of_service", label: "Terms of service" },
    ],
    // Two steps: find the documents, then review them. Splitting them lets a
    // renewal stop at step 1 ("same VPAT as last year").
    findDocs: retrieveAtiDocuments,
    generate: generateAtiReport,
    reportKey: "ati_review",
    readReport: (r) => {
      const a = r.ati_review || {};
      return {
        status: a.status,
        error: a.error,
        tier: a.risk_tier,
        generatedAt: a.generated_at,
        body: a.report_body,
        actions: a.reviewer_actions || [],
        extra: a.draft_message_to_requester
          ? [{ title: "Draft message to the requester", text: a.draft_message_to_requester }]
          : [],
        footnote: (a.precedent || {}).found ? a.precedent.summary : null,
        banner:
          "Draft for reviewer edit — not a decision. Phase 4 (hands-on manual testing) must be performed by a person.",
      };
    },
  },
  itso: {
    key: "itso",
    title: "Security Dashboard",
    subtitle: "ITSO security review",
    expected: [
      { id: "hecvat", label: "HECVAT" },
      { id: "soc2", label: "SOC 2 report" },
      { id: "privacy_policy", label: "Privacy policy" },
      { id: "terms_of_service", label: "Terms of service" },
    ],
    generate: regenerateSecurityReport,
    reportKey: "security_review",
    readReport: (r) => {
      const s = r.security_review || {};
      return {
        status: s.status,
        error: s.error,
        tier: s.risk_tier ? `${s.risk_tier}${s.risk_score ? ` (${s.risk_score}/10)` : ""}` : null,
        generatedAt: s.generated_at,
        body: toPlainText(s.report_markdown),
        actions: s.recommendations || [],
        extra: [],
        footnote: s.hecvat_provided === false ? "No HECVAT was provided by the vendor." : null,
        banner: "Draft for reviewer edit — not a decision.",
      };
    },
  },
  integration: {
    key: "integration",
    title: "Data Integration Dashboard",
    subtitle: "Campus system integration review",
    expected: [],
    generate: null,
    generateNote:
      "The data integration review isn't defined yet. Documents and the final report can still be uploaded below.",
  },
};

// Match an S3 filename to a checklist slot: "vpat.pdf" / "VPAT 2.4.pdf" -> vpat.
function fileMatchesDoc(filename, docId) {
  const stem = String(filename || "").toLowerCase().replace(/\.[^.]+$/, "");
  const norm = stem.replace(/[^a-z0-9]/g, "");
  const target = docId.replace(/[^a-z0-9]/g, "");
  return norm.startsWith(target) || norm.includes(target);
}

function Column({ n, title, hint, children }) {
  return (
    <div style={styles.column}>
      <div style={styles.columnHead}>
        <span style={styles.columnNum}>{n}</span>
        <span style={styles.columnTitle}>{title}</span>
      </div>
      {hint && <div style={styles.columnHint}>{hint}</div>}
      <div style={styles.columnBody}>{children}</div>
    </div>
  );
}

// A file input styled as a button. Rendered per slot so "replace this VPAT" is
// unambiguous about which file it replaces.
function UploadButton({ label, busy, onFile, disabled }) {
  return (
    <label style={{ ...styles.uploadBtn, ...(busy || disabled ? styles.btnDisabled : null) }}>
      {busy ? "Uploading…" : label}
      <input
        type="file"
        disabled={busy || disabled}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          if (f) onFile(f);
          e.target.value = ""; // let the same file be re-picked after a failure
        }}
        style={{ display: "none" }}
      />
    </label>
  );
}

export default function ReviewDashboard() {
  const { requestId, reviewType } = useParams();
  const navigate = useNavigate();
  const cfg = REVIEW_TYPES[reviewType];

  const [record, setRecord] = useState(null);
  const [docs, setDocs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [rec, dd] = await Promise.all([getRequest(requestId), getReviewDocs(requestId)]);
      setRecord(rec);
      setDocs((dd.review_docs || {})[reviewType] || {});
    } catch (e) {
      setError(e.message || "Could not load this request.");
    } finally {
      setLoading(false);
    }
  }, [requestId, reviewType]);

  useEffect(() => {
    load();
  }, [load]);

  if (!cfg) {
    return (
      <div style={styles.page}>
        <div style={styles.centered}>
          Unknown review type "{reviewType}".{" "}
          <button style={styles.linkBtn} onClick={() => navigate("/admin")}>
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const requestor = (record && record.requestor) || {};
  const report = record && cfg.readReport ? cfg.readReport(record) : null;
  // Files (with presigned download URLs) come from /review-docs. Which file is
  // the final report comes from the record's `final_reports` map — it can't
  // live inside review_docs, because the S3 event handler replaces that subtree
  // wholesale on every upload.
  const files = (docs && docs.files) || [];
  const finalReportName = ((record && record.final_reports) || {})[reviewType] || null;

  // The final report is stored in the same S3 folder as the evidence, so it
  // must be filtered out of column 1 — otherwise the reviewer's own review
  // shows up as a vendor document.
  const evidenceFiles = files.filter((f) => (f.name || f) !== finalReportName);
  const finalReportFile = files.find((f) => (f.name || f) === finalReportName) || null;

  function fileFor(docId) {
    return evidenceFiles.find((f) => fileMatchesDoc(f.name || f, docId)) || null;
  }

  const matched = new Set(
    cfg.expected.map((d) => (fileFor(d.id) || {}).name).filter(Boolean)
  );
  const extraFiles = evidenceFiles.filter((f) => !matched.has(f.name));

  async function handleUpload(file, kind) {
    setBusy(kind === "final_report" ? "final" : "doc");
    setError("");
    try {
      await uploadReviewDoc(requestId, reviewType, file, kind);
      await load();
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleFindDocs() {
    setBusy("retrieve");
    setError("");
    try {
      setRecord(await cfg.findDocs(requestId));
    } catch (e) {
      setError(e.message || "Could not retrieve documents.");
    } finally {
      setBusy("");
    }
  }

  async function handleGenerate() {
    setBusy("generate");
    setError("");
    try {
      await cfg.generate(requestId);
      // Both generators read documents and call Bedrock, so both return 202 and
      // finish in the background — the ATI one took over two minutes on a real
      // VPAT. Poll rather than expecting the POST to carry the result.
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const fresh = await getRequest(requestId);
        const st = (fresh[cfg.reportKey] || {}).status;
        if (st === "complete" || st === "failed") {
          setRecord(fresh);
          if (st === "failed") {
            setError((fresh[cfg.reportKey] || {}).error || "Generation failed.");
          }
          return;
        }
      }
      setError("Still running. Reload this page to check.");
    } catch (e) {
      setError(e.message || "Could not generate the report.");
    } finally {
      setBusy("");
    }
  }

  // The draft lives in DynamoDB as text, not as an S3 file, so the download is
  // assembled here rather than fetched.
  function downloadDraft() {
    const parts = [
      `SDSU ${cfg.title.replace(" Dashboard", "")} Review (DRAFT) — ${requestor.software_name || ""}`,
      `Generated: ${report.generatedAt || ""}`,
      `Draft risk tier: ${report.tier || "Unknown"}`,
      "",
      report.banner,
      "",
      "WHAT THE REVIEWER STILL NEEDS TO DO",
      ...(report.actions || []).map((a) => `- ${a}`),
      "",
      "DRAFT REVIEW",
      report.body || "",
      ...(report.extra || []).flatMap((x) => ["", x.title.toUpperCase(), x.text]),
      ...(report.footnote ? ["", report.footnote] : []),
    ];
    const blob = new Blob([parts.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cfg.key}_draft_${(requestor.software_name || "review").replace(/\W+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => navigate("/admin")}>
            ← Dashboard
          </button>
          <div>
            <div style={styles.title}>{cfg.title}</div>
            <div style={styles.subtitle}>
              {loading ? "loading…" : `${requestor.software_name || "—"} · ${requestor.department || "—"}`}
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>{cfg.subtitle}</div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.columns}>
        {/* ── Column 1: the evidence ── */}
        <Column
          n="1"
          title="Documents"
          hint="Vendor evidence in the S3 bucket. Upload to add or replace a file by hand."
        >
          {cfg.expected.length === 0 && extraFiles.length === 0 && (
            <div style={styles.empty}>
              No document checklist is defined for this review yet. Any file uploaded here is
              stored against the request.
            </div>
          )}

          {cfg.expected.map((d) => {
            const f = fileFor(d.id);
            return (
              <div key={d.id} style={styles.docRow}>
                <div style={styles.docLabel}>{d.label}</div>
                {f ? (
                  <a href={f.url} target="_blank" rel="noreferrer" style={styles.downloadBtn}>
                    ↓ Download {f.name}
                  </a>
                ) : (
                  <div style={styles.missing}>Not in the bucket</div>
                )}
                <UploadButton
                  label={f ? "Replace file" : "Upload file"}
                  busy={busy === "doc"}
                  onFile={(file) => handleUpload(file, "document")}
                />
              </div>
            );
          })}

          {extraFiles.length > 0 && (
            <div style={styles.docRow}>
              <div style={styles.docLabel}>Other files</div>
              {extraFiles.map((f) => (
                <a
                  key={f.name}
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.downloadBtn}
                >
                  ↓ Download {f.name}
                </a>
              ))}
            </div>
          )}

          {cfg.expected.length === 0 && (
            <UploadButton
              label="Upload file"
              busy={busy === "doc"}
              onFile={(file) => handleUpload(file, "document")}
            />
          )}
        </Column>

        {/* ── Column 2: the machine's draft ── */}
        <Column
          n="2"
          title="Draft report"
          hint="Generated against the review criteria from the documents in column 1."
        >
          {cfg.generate ? (
            <>
              {cfg.findDocs && (
                <>
                  <button
                    style={{ ...styles.actionBtn, ...(busy ? styles.btnDisabled : null) }}
                    disabled={busy !== ""}
                    onClick={handleFindDocs}
                  >
                    {busy === "retrieve" ? "Searching…" : "Find vendor documents online"}
                  </button>
                  <div style={styles.stepNote}>
                    Searches the vendor's site for the VPAT, privacy policy and terms. Uploads in
                    column 1 are used as-is and never overwritten.
                  </div>
                </>
              )}

              <button
                style={{ ...styles.actionBtn, ...styles.actionBtnPrimary, ...(busy ? styles.btnDisabled : null) }}
                disabled={busy !== ""}
                onClick={handleGenerate}
              >
                {busy === "generate" ? "Generating… (up to 2 min)" : "Generate Draft Report"}
              </button>

              {report && report.status === "complete" && (
                <div style={styles.draftBox}>
                  <div style={styles.draftRow}>
                    <span style={styles.draftLabel}>Draft risk tier</span>
                    <span style={styles.draftTier}>{report.tier || "Unknown"}</span>
                  </div>
                  <div style={styles.draftMeta}>
                    generated{" "}
                    {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : ""}
                  </div>
                  <button style={styles.downloadBtn} onClick={downloadDraft}>
                    ↓ Download draft report
                  </button>
                  <div style={styles.draftBanner}>{report.banner}</div>

                  {report.actions.length > 0 && (
                    <>
                      <div style={styles.reportSubTitle}>What you still need to do</div>
                      <ul style={styles.reportList}>
                        {report.actions.map((a, i) => (
                          <li key={i} style={styles.reportListItem}>{a}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  <pre style={styles.draftBody}>{report.body}</pre>

                  {report.extra.map((x) => (
                    <div key={x.title}>
                      <div style={styles.reportSubTitle}>{x.title}</div>
                      <pre style={styles.draftBody}>{x.text}</pre>
                    </div>
                  ))}

                  {report.footnote && <div style={styles.reportFootnote}>{report.footnote}</div>}
                </div>
              )}
              {report && report.status === "pending" && (
                <div style={styles.stepNote}>Report is generating…</div>
              )}
              {report && report.status === "failed" && (
                <div style={styles.error}>{report.error || "Generation failed."}</div>
              )}
            </>
          ) : (
            <div style={styles.empty}>{cfg.generateNote}</div>
          )}
        </Column>

        {/* ── Column 3: the human's review ── */}
        <Column
          n="3"
          title="Final report"
          hint="The reviewer's own assessment. This is the record of decision, not the draft."
        >
          {finalReportFile ? (
            <div style={styles.docRow}>
              <div style={styles.docLabel}>Uploaded</div>
              <a
                href={finalReportFile.url}
                target="_blank"
                rel="noreferrer"
                style={styles.downloadBtn}
              >
                ↓ Download {finalReportFile.name}
              </a>
              <UploadButton
                label="Replace final report"
                busy={busy === "final"}
                onFile={(file) => handleUpload(file, "final_report")}
              />
            </div>
          ) : (
            <div style={styles.docRow}>
              <div style={styles.empty}>No final report uploaded yet.</div>
              <UploadButton
                label="Upload final report"
                busy={busy === "final"}
                onFile={(file) => handleUpload(file, "final_report")}
              />
            </div>
          )}
        </Column>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", fontFamily: C.sans, color: C.ink, backgroundColor: C.paper },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    backgroundColor: C.ink,
    color: C.white,
    paddingTop: "16px",
    paddingRight: "24px",
    paddingBottom: "16px",
    paddingLeft: "24px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "16px" },
  headerRight: { fontFamily: C.mono, fontSize: "11.5px", color: C.stoneLight },
  backBtn: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    fontWeight: 700,
    color: C.white,
    backgroundColor: "transparent",
    border: `1px solid ${C.stone}`,
    paddingTop: "7px",
    paddingRight: "12px",
    paddingBottom: "7px",
    paddingLeft: "12px",
    cursor: "pointer",
  },
  title: { fontSize: "20px", fontWeight: 700, lineHeight: 1.2 },
  subtitle: { fontFamily: C.mono, fontSize: "11.5px", color: C.stoneLight, marginTop: "2px" },
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "1px",
    backgroundColor: C.line,
    borderTop: `1px solid ${C.line}`,
  },
  column: {
    backgroundColor: C.white,
    paddingTop: "18px",
    paddingRight: "20px",
    paddingBottom: "24px",
    paddingLeft: "20px",
    minWidth: 0,
  },
  columnHead: { display: "flex", alignItems: "center", gap: "8px" },
  columnNum: {
    fontFamily: C.mono,
    fontSize: "10px",
    fontWeight: 700,
    color: C.white,
    backgroundColor: C.red,
    width: "18px",
    height: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  columnTitle: {
    fontFamily: C.mono,
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: C.red,
  },
  columnHint: { fontSize: "12px", color: C.stone, lineHeight: 1.5, marginTop: "8px" },
  columnBody: { display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" },
  docRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
    borderLeft: `2px solid ${C.line}`,
    paddingLeft: "10px",
  },
  docLabel: { fontFamily: C.mono, fontSize: "11px", fontWeight: 700, color: C.ink },
  missing: { fontFamily: C.mono, fontSize: "11px", color: C.stoneLight, fontStyle: "italic" },
  empty: { fontSize: "12.5px", color: C.stone, lineHeight: 1.5 },
  downloadBtn: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    fontWeight: 700,
    color: C.red,
    textDecoration: "none",
    backgroundColor: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    wordBreak: "break-all",
  },
  uploadBtn: {
    fontFamily: C.mono,
    fontSize: "11px",
    fontWeight: 700,
    color: C.ink,
    backgroundColor: C.white,
    border: `1px solid ${C.line}`,
    paddingTop: "6px",
    paddingRight: "10px",
    paddingBottom: "6px",
    paddingLeft: "10px",
    cursor: "pointer",
    display: "inline-block",
  },
  actionBtn: {
    fontFamily: C.mono,
    fontSize: "12px",
    fontWeight: 700,
    color: C.ink,
    backgroundColor: C.white,
    border: `1px solid ${C.line}`,
    paddingTop: "10px",
    paddingRight: "14px",
    paddingBottom: "10px",
    paddingLeft: "14px",
    cursor: "pointer",
  },
  actionBtnPrimary: { color: C.white, backgroundColor: C.ink, borderColor: C.ink },
  btnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  stepNote: { fontFamily: C.mono, fontSize: "10.5px", color: C.stoneLight, lineHeight: 1.5 },
  draftBox: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" },
  draftRow: { display: "flex", alignItems: "baseline", gap: "8px" },
  draftLabel: { fontFamily: C.mono, fontSize: "11px", color: C.stone },
  draftTier: { fontFamily: C.mono, fontSize: "14px", fontWeight: 700, color: C.ink },
  draftMeta: { fontFamily: C.mono, fontSize: "10.5px", color: C.stoneLight },
  draftBanner: {
    fontFamily: C.mono,
    fontSize: "10.5px",
    lineHeight: 1.5,
    color: C.ink,
    backgroundColor: C.paperAlt,
    borderLeft: `3px solid ${C.red}`,
    paddingTop: "8px",
    paddingRight: "10px",
    paddingBottom: "8px",
    paddingLeft: "10px",
  },
  reportSubTitle: {
    fontFamily: C.mono,
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: C.stone,
    marginTop: "10px",
    marginBottom: "6px",
  },
  reportList: {
    marginTop: 0,
    marginBottom: 0,
    paddingLeft: "18px",
  },
  reportListItem: {
    fontSize: "12.5px",
    lineHeight: 1.5,
    color: C.ink,
    marginBottom: "5px",
  },
  reportFootnote: {
    fontFamily: C.mono,
    fontSize: "10.5px",
    lineHeight: 1.5,
    color: C.stone,
    marginTop: "10px",
  },
  draftBody: {
    fontFamily: C.sans,
    fontSize: "12px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    backgroundColor: C.paperAlt,
    border: `1px solid ${C.line}`,
    padding: "12px",
    maxHeight: "360px",
    overflowY: "auto",
    marginTop: 0,
    marginBottom: 0,
  },
  error: {
    fontFamily: C.mono,
    fontSize: "11.5px",
    color: C.red,
    paddingTop: "10px",
    paddingRight: "24px",
    paddingBottom: "10px",
    paddingLeft: "24px",
  },
  centered: { padding: "40px", textAlign: "center" },
  linkBtn: {
    fontFamily: C.mono,
    fontSize: "12px",
    color: C.red,
    background: "none",
    border: "none",
    cursor: "pointer",
    textDecoration: "underline",
  },
};
