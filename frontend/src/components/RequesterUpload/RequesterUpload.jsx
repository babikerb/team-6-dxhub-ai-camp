import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getRequesterDocsContext,
  submitRequesterDocLink,
  uploadRequesterDoc,
} from "../../api.js";

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DocCard({ doc, maxBytes, onUploaded }) {
  const [mode, setMode] = useState("file"); // file | link
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    setDoneMsg("");
    try {
      await uploadRequesterDoc(doc.requestId, doc.doc_type, file);
      setDoneMsg(`Uploaded ${file.name}`);
      onUploaded();
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLink() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    setDoneMsg("");
    try {
      await submitRequesterDocLink(doc.requestId, doc.doc_type, trimmed);
      setDoneMsg("Link archived successfully.");
      setUrl("");
      onUploaded();
    } catch (e) {
      setError(e.message || "Could not fetch that link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div>
          <div style={styles.docLabel}>{doc.label}</div>
          <div style={styles.docMeta}>
            For {doc.review_type?.toUpperCase()} review
            {doc.fulfilled ? " · already provided" : " · still needed"}
          </div>
        </div>
        <div
          style={{
            ...styles.badge,
            background: doc.fulfilled ? "#E8F5E9" : "#FFF3E0",
            color: doc.fulfilled ? "#2E7D32" : "#E65100",
          }}
        >
          {doc.fulfilled ? "Received" : "Needed"}
        </div>
      </div>

      {doc.fulfilled && (
        <div style={styles.fulfilledNote}>
          {doc.filename || "Document on file"}
          {doc.source_url ? ` · ${doc.source_url}` : ""}
          {doc.uploaded_at ? ` · ${new Date(doc.uploaded_at).toLocaleString()}` : ""}
        </div>
      )}

      <div style={styles.modeRow}>
        <button
          type="button"
          style={{ ...styles.modeBtn, ...(mode === "file" ? styles.modeBtnActive : {}) }}
          onClick={() => setMode("file")}
          disabled={busy}
        >
          Upload file
        </button>
        <button
          type="button"
          style={{ ...styles.modeBtn, ...(mode === "link" ? styles.modeBtnActive : {}) }}
          onClick={() => setMode("link")}
          disabled={busy}
        >
          Paste web link
        </button>
      </div>

      {mode === "file" ? (
        <div style={styles.inputBlock}>
          <input
            type="file"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div style={styles.hint}>Max {formatBytes(maxBytes)}. PDF, Word, HTML, or text.</div>
        </div>
      ) : (
        <div style={styles.inputBlock}>
          <input
            style={styles.urlInput}
            type="url"
            placeholder="https://vendor.example.com/privacy"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            onKeyDown={(e) => e.key === "Enter" && handleLink()}
          />
          <button type="button" style={styles.submitBtn} onClick={handleLink} disabled={busy || !url.trim()}>
            {busy ? "Fetching…" : "Submit link"}
          </button>
          <div style={styles.hint}>
            We download a copy for the review team. Only public http(s) pages.
          </div>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
      {doneMsg && <div style={styles.success}>{doneMsg}</div>}
    </div>
  );
}

export default function RequesterUpload() {
  const { requestId } = useParams();
  const id = decodeURIComponent(requestId || "");
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCtx(await getRequesterDocsContext(id));
    } catch (e) {
      setError(e.message || "Could not load this upload page.");
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const docs = (ctx?.documents || []).map((d) => ({ ...d, requestId: id }));
  const remaining = docs.filter((d) => !d.fulfilled).length;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div style={styles.badgeHeader}>SDSU</div>
          <div>
            <div style={styles.title}>Upload review documents</div>
            <div style={styles.subtitle}>Software Request Assistant</div>
          </div>
        </div>

        <div style={styles.body}>
          {loading && <div style={styles.muted}>Loading…</div>}
          {error && <div style={styles.error}>{error}</div>}

          {ctx && (
            <>
              <div style={styles.summary}>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryLabel}>Procurement ID</span>
                  <span style={styles.summaryValue}>{ctx.request_id}</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryLabel}>Software</span>
                  <span style={styles.summaryValue}>{ctx.software_name || "—"}</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryLabel}>Status</span>
                  <span style={styles.summaryValue}>
                    {remaining === 0
                      ? "All requested documents received"
                      : `${remaining} document${remaining === 1 ? "" : "s"} still needed`}
                  </span>
                </div>
              </div>

              {docs.length === 0 ? (
                <div style={styles.muted}>
                  No documents are currently requested for this application.
                </div>
              ) : (
                docs.map((doc) => (
                  <DocCard
                    key={doc.doc_type}
                    doc={doc}
                    maxBytes={ctx.max_upload_bytes}
                    onUploaded={load}
                  />
                ))
              )}

              <div style={styles.footerLinks}>
                <Link to={`/search?id=${encodeURIComponent(id)}`} style={styles.link}>
                  Track this request →
                </Link>
                <Link to="/" style={styles.linkMuted}>
                  Back to start
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--paper-alt, #F5F2EC)",
    fontFamily: "'IBM Plex Sans', sans-serif",
    padding: "24px 16px",
    boxSizing: "border-box",
  },
  shell: {
    maxWidth: 640,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid var(--line, #E0DCD3)",
    borderRadius: 10,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    gap: 14,
    alignItems: "center",
    padding: "18px 22px",
    background: "var(--ink, #1A1A1A)",
    color: "#fff",
  },
  badgeHeader: {
    background: "var(--red, #C41230)",
    color: "#fff",
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.06em",
    padding: "7px 11px",
    borderRadius: 6,
  },
  title: {
    fontFamily: "'Source Serif 4', serif",
    fontWeight: 600,
    fontSize: 18,
  },
  subtitle: {
    marginTop: 3,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    color: "var(--stone-light, #B8B2A8)",
  },
  body: {
    padding: "20px 22px 26px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  summary: {
    border: "1px solid var(--line, #E0DCD3)",
    borderRadius: 8,
    padding: "4px 14px",
    background: "var(--paper-alt, #F5F2EC)",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid var(--line, #E0DCD3)",
  },
  summaryLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--stone, #6B6560)",
  },
  summaryValue: {
    fontSize: 13.5,
    fontWeight: 600,
    textAlign: "right",
    wordBreak: "break-word",
  },
  card: {
    border: "1px solid var(--line, #E0DCD3)",
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start",
  },
  docLabel: { fontWeight: 700, fontSize: 15 },
  docMeta: {
    marginTop: 2,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "var(--stone, #6B6560)",
  },
  badge: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "4px 10px",
    borderRadius: 999,
    flexShrink: 0,
  },
  fulfilledNote: {
    fontSize: 12.5,
    color: "var(--stone, #6B6560)",
    wordBreak: "break-word",
  },
  modeRow: { display: "flex", gap: 8 },
  modeBtn: {
    border: "1px solid var(--line, #E0DCD3)",
    background: "#fff",
    padding: "7px 12px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
  },
  modeBtnActive: {
    background: "var(--ink, #1A1A1A)",
    color: "#fff",
    borderColor: "var(--ink, #1A1A1A)",
  },
  inputBlock: { display: "flex", flexDirection: "column", gap: 8 },
  urlInput: {
    border: "none",
    borderBottom: "1.5px solid var(--stone-light, #B8B2A8)",
    padding: "6px 2px",
    fontSize: 14,
    outline: "none",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  submitBtn: {
    alignSelf: "flex-start",
    border: "1px solid var(--ink, #1A1A1A)",
    background: "var(--ink, #1A1A1A)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: "0.04em",
    padding: "8px 14px",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  hint: {
    fontSize: 11.5,
    color: "var(--stone, #6B6560)",
  },
  error: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    color: "var(--red, #C41230)",
    fontWeight: 700,
  },
  success: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11.5,
    color: "#2E7D32",
    fontWeight: 700,
  },
  muted: { color: "var(--stone, #6B6560)", fontSize: 14 },
  footerLinks: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 6,
  },
  link: {
    color: "var(--ink, #1A1A1A)",
    fontWeight: 700,
    fontSize: 13.5,
  },
  linkMuted: {
    color: "var(--stone, #6B6560)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
  },
};
