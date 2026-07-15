import { useState, useRef, useEffect } from "react";

// ---- Conversation script ----
const STEPS = [
  {
    id: "software_name",
    bot: "Hi! I'm here to help route your software request. First, what's the name of the software you're requesting?",
    type: "text",
    placeholder: "e.g. Zoom, Adobe Creative Cloud...",
  },
  {
    id: "scope",
    bot: (a) => `Got it — ${a.software_name || "this software"}. Who will this be available to?`,
    type: "choice",
    field: "scope",
    options: [
      { label: "Just me / one person", value: "individual" },
      { label: "One classroom", value: "classroom" },
      { label: "One department or office", value: "department" },
      { label: "An entire college or the whole university", value: "college_university" },
    ],
  },
  {
    id: "users",
    bot: "About how many people do you expect to use it?",
    type: "choice",
    field: "users",
    options: [
      { label: "1–30 people", value: "1-30" },
      { label: "30–100 people", value: "30-100" },
      { label: "More than 100 people", value: "100+" },
    ],
  },
  {
    id: "access",
    bot: "How will people access it?",
    type: "choice",
    field: "access",
    options: [
      { label: "Installed on a computer", value: "computer" },
      { label: "A mobile app", value: "mobile" },
      { label: "Through a web browser", value: "browser" },
      { label: "Not sure yet", value: "unsure" },
    ],
  },
  {
    id: "category",
    bot: "Where does the software actually run?",
    type: "choice",
    field: "category",
    options: [
      { label: "On SDSU's own servers (data center)", value: "onprem-datacenter" },
      { label: "Installed locally on a device", value: "onprem-local" },
      { label: "In the cloud (a vendor's website/platform)", value: "cloud" },
      { label: "It's a plug-in / add-on to something we already use", value: "addon" },
    ],
  },
  {
    id: "data_sharing",
    bot: "Will this software need to send or receive data from other SDSU systems — like class rosters, email, or student records?",
    type: "choice",
    field: "data_sharing",
    options: [
      { label: "Yes, it connects to other systems", value: "yes" },
      { label: "No, it's self-contained", value: "no" },
      { label: "Not sure", value: "unsure" },
    ],
  },
  {
    id: "compliance",
    bot: "Are there any legal or compliance rules tied to this — for example, does it deal with health records, financial aid, or research data with special agreements?",
    type: "choice",
    field: "compliance",
    options: [
      { label: "Yes, there are rules like that", value: "yes" },
      { label: "No, not that I know of", value: "no" },
    ],
  },
  {
    id: "level1",
    bot: "Will it ever store or handle highly sensitive info — things like Social Security numbers, passwords, or bank/financial account details?",
    type: "choice",
    field: "level1",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: "level2",
    bot: "What about moderately sensitive info — like student ID numbers, grades, or contact details?",
    type: "choice",
    field: "level2",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
];

// ---- Rule logic ----
function evaluate(a) {
  const highScope = a.scope === "classroom" || a.scope === "college_university";
  const highUsers = a.users === "30-100" || a.users === "100+";
  const ati = highUsers && highScope ? "Yes" : "No";

  const integration = a.data_sharing === "yes" ? "Yes" : "No";

  let risk = "Low";
  if (a.level1 === "yes") risk = "High";
  else if (a.level2 === "yes") risk = "Medium";
  const itso = risk === "High" || risk === "Medium" ? "Yes" : "No";

  return { ati, integration, itso, risk };
}

function resolveBotText(step, answers) {
  return typeof step.bot === "function" ? step.bot(answers) : step.bot;
}

function ResultRow({ label, value }) {
  const yes = value === "Yes";
  return (
    <div style={styles.resultRow}>
      <span>{label}</span>
      <span style={{ ...styles.resultPill, background: yes ? "#C8102E" : "#3A3A3A", color: "#fff" }}>
        {value}
      </span>
    </div>
  );
}

function RequesterChat({ requestId }) {
  const [answers, setAnswers] = useState({});
  const [messages, setMessages] = useState([
    { from: "bot", text: resolveBotText(STEPS[0], {}) },
  ]);
  const [stepIndex, setStepIndex] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [done, setDone] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const currentStep = STEPS[stepIndex];

  function advance(fieldValue, displayText) {
    const key = currentStep.field || currentStep.id;
    const updatedAnswers = { ...answers, [key]: fieldValue };

    setMessages((m) => [...m, { from: "user", text: displayText }]);
    setAnswers(updatedAnswers);

    const next = stepIndex + 1;
    if (next < STEPS.length) {
      setTimeout(() => {
        setMessages((m) => [...m, { from: "bot", text: resolveBotText(STEPS[next], updatedAnswers) }]);
        setStepIndex(next);
      }, 300);
    } else {
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            from: "bot",
            text: "Thanks — that's everything I need. Your request has been submitted for IT Review. You'll see it move through the review steps shortly.",
          },
        ]);
        setDone(true);
      }, 300);
    }
  }

  function handleTextSubmit() {
    const trimmed = textInput.trim();
    if (!trimmed) return;
    advance(trimmed, trimmed);
    setTextInput("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTextSubmit();
    }
  }

  const progress = Math.min(100, Math.round((stepIndex / STEPS.length) * 100));
  const result = done ? evaluate(answers) : null;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerBadge}>SDSU</div>
          <div>
            <div style={styles.headerTitle}>Software Request Assistant</div>
            <div style={styles.headerSubtitle}>
              {requestId ? `Request #${requestId.slice(0, 8)}` : "IT Review intake"}
            </div>
          </div>
        </div>

        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>

        <div ref={scrollRef} style={styles.messages}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                ...styles.bubbleRow,
                justifyContent: m.from === "bot" ? "flex-start" : "flex-end",
              }}
            >
              <div style={m.from === "bot" ? styles.botBubble : styles.userBubble}>
                {m.text}
              </div>
            </div>
          ))}

          {done && result && (
            <div style={styles.resultCard}>
              <div style={styles.resultTitle}>Routing summary</div>
              <ResultRow label="ATI Review" value={result.ati} />
              <ResultRow label="Integration Review" value={result.integration} />
              <ResultRow label="ITSO / Security Review" value={result.itso} />
              <div style={styles.resultFootnote}>Data sensitivity assessed as {result.risk} risk.</div>
            </div>
          )}
        </div>

        {!done && (
          <div style={styles.inputArea}>
            {currentStep.type === "choice" ? (
              <div style={styles.optionsWrap}>
                {currentStep.options.map((opt) => (
                  <button
                    key={opt.value}
                    style={styles.optionButton}
                    onClick={() => advance(opt.value, opt.label)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={styles.textForm}>
                <input
                  style={styles.textInput}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={currentStep.placeholder || "Type your answer..."}
                  autoFocus
                />
                <button type="button" style={styles.sendButton} onClick={handleTextSubmit}>
                  Send
                </button>
              </div>
            )}
          </div>
        )}
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
    maxWidth: "480px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "640px",
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
  progressTrack: {
    height: "4px",
    background: "#EDEDED",
  },
  progressFill: {
    height: "100%",
    background: "#C8102E",
    transition: "width 0.3s ease",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    background: "#FAFAFA",
  },
  bubbleRow: { display: "flex" },
  botBubble: {
    background: "#EFEFEF",
    color: "#1A1A1A",
    padding: "10px 14px",
    borderRadius: "14px 14px 14px 2px",
    maxWidth: "80%",
    fontSize: "14px",
    lineHeight: 1.4,
  },
  userBubble: {
    background: "#C8102E",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "14px 14px 2px 14px",
    maxWidth: "80%",
    fontSize: "14px",
    lineHeight: 1.4,
  },
  inputArea: {
    padding: "14px 16px",
    borderTop: "1px solid #EDEDED",
    background: "#fff",
  },
  optionsWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  optionButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1.5px solid #C8102E",
    background: "#fff",
    color: "#C8102E",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "left",
  },
  textForm: { display: "flex", gap: "8px" },
  textInput: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1.5px solid #DDD",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  sendButton: {
    padding: "10px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#1A1A1A",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  resultCard: {
    marginTop: "8px",
    background: "#fff",
    border: "1.5px solid #1A1A1A",
    borderRadius: "12px",
    padding: "14px",
  },
  resultTitle: { fontWeight: 700, marginBottom: "8px", fontSize: "14px" },
  resultRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    fontSize: "13px",
    borderBottom: "1px solid #F0F0F0",
  },
  resultPill: {
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
  },
  resultFootnote: {
    marginTop: "8px",
    fontSize: "12px",
    color: "#666",
  },
};

export default RequesterChat;
