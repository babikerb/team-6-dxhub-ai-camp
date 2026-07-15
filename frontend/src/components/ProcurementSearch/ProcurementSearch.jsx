import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRequestByProcurementId } from "./api.js";

const STATUS_LABELS = {
  Submitted: "Submitted",
  ChatbotInProgress: "IT review in progress",
  FlagsComputed: "Flags computed",
  UnderStaffReview: "Under staff review",
  Approved: "Approved",
  Denied: "Denied",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function DetailRow({ label, value }) {
  return (
    <div style={styles.detailRow}>
      <div style={styles.detailLabel}>{label}</div>
      <div style={styles.detailValue}>{value || "—"}</div>
    </div>
  );
}

function ProcurementSearch() {
  const navigate = useNavigate();
  const [procurementId, setProcurementId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null);

  async function handleSearch() {
    const trimmed = procurementId.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setRecord(null);
    try {
      const result = await getRequestByProcurementId(trimmed);
      setRecord(result);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function searchAnother() {
    setProcurementId("");
    setRecord(null);
    setError(null);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerBadge}>SDSU</div>
          <div>
            <div style={styles.headerTitle}>Software Request Assistant</div>
            <div style={styles.headerSubtitle}>Search procurements</div>
          </div>
        </div>

        <div style={styles.body}>
          {!record && (
            <>
              <div style={styles.label}>Procurement ID</div>
              <div style={styles.searchRow}>
                <input
                  style={styles.input}
                  value={procurementId}
                  onChange={(e) => setProcurementId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Paste your procurement ID"
                  autoFocus
                />
                <button type="button" onClick={handleSearch} style={styles.searchButton} disabled={loading}>
                  {loading ? "Searching…" : "Search"}
                </button>
              </div>
              {error && <div style={styles.error}>{error}</div>}
            </>
          )}

          {record && (
            <div style={styles.result}>
              <div style={styles.resultEyebrow}>Procurement found</div>
              <div style={styles.resultHeading}>{record.requestor?.software_name || "Untitled request"}</div>
              <div style={styles.statusBadge}>{STATUS_LABELS[record.status] || record.status}</div>

              <div style={styles.detailList}>
                <DetailRow label="Procurement ID" value={record.request_id} />
                <DetailRow label="Requested for" value={record.requestor?.requested_for_name} />
                <DetailRow label="Department" value={record.requestor?.department} />
                <DetailRow label="Submitted" value={formatDate(record.created_at)} />
                <DetailRow label="Last updated" value={formatDate(record.updated_at)} />
              </div>

              <button type="button" onClick={searchAnother} style={styles.searchButton}>
                Search another procurement
              </button>
            </div>
          )}

          <button type="button" onClick={() => navigate("/")} style={styles.backLink}>
            &larr; Back to start
          </button>
        </div>
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
    gap: "16px",
  },
  label: {
    fontSize: "14.5px",
    fontWeight: 600,
    color: "var(--ink)",
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  input: {
    flex: 1,
    border: "none",
    borderBottom: "1.5px solid var(--stone-light)",
    background: "transparent",
    fontSize: "15px",
    padding: "6px 2px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "'IBM Plex Mono', monospace",
    color: "var(--ink)",
  },
  searchButton: {
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "12.5px",
    letterSpacing: "0.04em",
    padding: "9px 16px",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
    whiteSpace: "nowrap",
  },
  error: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--red)",
    fontWeight: 700,
  },
  result: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  resultEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--red)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  resultHeading: {
    fontFamily: "'Source Serif 4', serif",
    fontSize: "19px",
    fontWeight: 600,
    color: "var(--ink)",
  },
  statusBadge: {
    alignSelf: "flex-start",
    background: "var(--paper-alt)",
    border: "1px solid var(--line)",
    borderRadius: "999px",
    padding: "4px 12px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--ink)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  detailList: {
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid var(--line)",
    marginTop: "6px",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 0",
    borderBottom: "1px solid var(--line)",
  },
  detailLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "10.5px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--stone)",
    flexShrink: 0,
  },
  detailValue: {
    fontSize: "13.5px",
    fontWeight: 600,
    color: "var(--ink)",
    textAlign: "right",
    wordBreak: "break-word",
  },
  backLink: {
    background: "none",
    border: "none",
    color: "var(--stone)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "12px",
    cursor: "pointer",
    padding: "4px 0",
    alignSelf: "flex-start",
  },
};

export default ProcurementSearch;
