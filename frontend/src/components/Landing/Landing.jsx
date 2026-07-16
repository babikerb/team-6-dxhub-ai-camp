import { useNavigate } from "react-router-dom";

const OPTIONS = [
  {
    id: "start",
    title: "Start a ticket",
    description: "File a new software request and walk through the IT review questions.",
    path: "/start",
  },
  {
    id: "search",
    title: "Search procurements",
    description: "Look up an existing request using its procurement ID.",
    path: "/search",
  },
];

function Landing() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerBadge}>SDSU</div>
          <div>
            <div style={styles.headerTitle}>Software Request Assistant</div>
            <div style={styles.headerSubtitle}>What would you like to do?</div>
          </div>
        </div>

        <div style={styles.optionList}>
          {OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.id}
              style={styles.optionRow}
              onClick={() => navigate(opt.path)}
              onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = "var(--red)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = "transparent")}
            >
              <div>
                <div style={styles.optionTitle}>{opt.title}</div>
                <div style={styles.optionDescription}>{opt.description}</div>
              </div>
              <span style={styles.optionMark}>&rarr;</span>
            </button>
          ))}
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
  optionList: {
    display: "flex",
    flexDirection: "column",
  },
  optionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    padding: "22px 28px",
    background: "transparent",
    border: "none",
    borderLeft: "3px solid transparent",
    borderBottom: "1px solid var(--line)",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-left-color 0.15s ease, background 0.15s ease",
    fontFamily: "inherit",
  },
  optionTitle: {
    fontFamily: "'Source Serif 4', serif",
    fontSize: "17px",
    fontWeight: 600,
    color: "var(--ink)",
    marginBottom: "4px",
  },
  optionDescription: {
    fontSize: "13px",
    color: "var(--stone)",
    lineHeight: 1.4,
  },
  optionMark: {
    color: "var(--red)",
    fontSize: "18px",
    flexShrink: 0,
  },
};

export default Landing;
