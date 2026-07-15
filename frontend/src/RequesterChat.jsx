import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { getRequest, submitChatbotReview } from "./api.js";
import { answersToItReview } from "./itReview.js";

// -----------------------------------------------------------------
// MASTER QUESTION LIST (Part B)
// software_name / scope_of_usage are skipped when already present from
// the intake form (pre-seeded into answers on load).
// -----------------------------------------------------------------
const STEPS = [
  {
    id: "software_name",
    label: "Item",
    bot: "What's the name of the software you're requesting?",
    type: "text",
    placeholder: "e.g. Zoom, Adobe Creative Cloud",
    skip: (a) => Boolean(a.software_name),
  },
  {
    id: "scope_of_usage",
    label: "Scope",
    bot: "Who will this be available to?",
    type: "choice",
    options: [
      { label: "Just me — one person", value: "Individual" },
      { label: "One classroom", value: "Classroom" },
      { label: "One department or office", value: "Department" },
      { label: "An entire college or the whole university", value: "University" },
    ],
    skip: (a) => Boolean(a.scope_of_usage),
  },
  {
    id: "estimated_users",
    label: "Reach",
    bot: "Roughly how many people, total, will use this software?",
    type: "choice",
    options: [
      { label: "1–30 people", value: "1-30" },
      { label: "30–100 people", value: "30-100" },
      { label: "More than 100 people", value: "100+" },
    ],
  },
  {
    id: "interaction_method",
    label: "Access",
    bot: "Will people mainly use it on a computer, a phone or tablet, through a web browser, or a mix? Select all that apply.",
    type: "multiselect",
    options: [
      { label: "Computer", value: "computer" },
      { label: "Phone or tablet", value: "mobile" },
      { label: "Web browser", value: "browser" },
    ],
  },
  {
    id: "software_category",
    label: "Hosting",
    bot: "Where does this software actually run?",
    type: "choice",
    options: [
      { label: "Installed by IT on a campus server", value: "onprem-datacenter" },
      { label: "Installed on your own computer", value: "onprem-local" },
      { label: "Something you log into online (a website/cloud app)", value: "cloud" },
      { label: "A small add-on inside another app you already use", value: "addon" },
    ],
  },
  {
    id: "shares_data_with_campus_system",
    label: "Integration",
    bot: "Will this software need to send or receive information with any other SDSU system, like Canvas, Oracle, or PeopleSoft/mySDSU?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: "integration_explanation",
    label: "Integration",
    bot: "Which system(s), and what kind of information would be shared?",
    type: "text",
    placeholder: "e.g. Canvas — class roster and grades",
    skip: (a) => a.shares_data_with_campus_system !== "yes",
  },
  {
    id: "sso_capable",
    label: "Login",
    bot: "Can people log in with their regular SDSUid — the same login as other campus systems — or does it use a separate username/password?",
    type: "choice",
    options: [
      { label: "Yes, uses SDSUid", value: "yes" },
      { label: "No, separate login", value: "no" },
      { label: "Not sure", value: "unsure" },
    ],
  },
  // Block A — always asked
  {
    id: "la_health",
    label: "Data",
    bot: "Will it handle health or medical information — the kind a doctor's office or student health center would keep?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: "la_pii",
    label: "Data",
    bot: "Will it store personal ID details like Social Security numbers, driver's license numbers, or dates of birth?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: "la_payment",
    label: "Data",
    bot: "Will it process credit card payments or store banking/payment information?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  {
    id: "la_lawenforcement",
    label: "Data",
    bot: "Will it store or access law enforcement or campus police records?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
  },
  // Block B — only asked if Block A was all "no"
  {
    id: "lb_coursework",
    label: "Data",
    bot: "Will students use this for coursework, grading, or advising?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    skip: (a) =>
      [a.la_health, a.la_pii, a.la_payment, a.la_lawenforcement].some((v) => v === "yes"),
  },
  {
    id: "lb_employee",
    label: "Data",
    bot: "Will it store employee info — personnel files, salaries, performance reviews?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    skip: (a) =>
      [a.la_health, a.la_pii, a.la_payment, a.la_lawenforcement].some((v) => v === "yes"),
  },
  {
    id: "lb_budget",
    label: "Data",
    bot: "Will it access campus budgets or internal financial records (not card payments)?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    skip: (a) =>
      [a.la_health, a.la_pii, a.la_payment, a.la_lawenforcement].some((v) => v === "yes"),
  },
  {
    id: "lb_research",
    label: "Data",
    bot: "Will it involve research data or IP — unpublished research, patents, grant data?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    skip: (a) =>
      [a.la_health, a.la_pii, a.la_payment, a.la_lawenforcement].some((v) => v === "yes"),
  },
  {
    id: "lb_legal",
    label: "Data",
    bot: "Will it involve communication with SDSU's legal counsel?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    skip: (a) =>
      [a.la_health, a.la_pii, a.la_payment, a.la_lawenforcement].some((v) => v === "yes"),
  },
  // Catch-alls — always asked
  {
    id: "other_data_category",
    label: "Other",
    bot: 'Is there any other sensitive information this software touches that we haven\'t covered? If not, just say "no."',
    type: "text",
    placeholder: "Describe, or type 'no'",
  },
  {
    id: "compliance_requirements",
    label: "Compliance",
    bot: "Is this tied to a research grant, an international privacy rule, or any other legal/contractual requirement you know of?",
    type: "text",
    placeholder: "Describe, or type 'no'",
  },
  {
    id: "vendor_privacy_policy_url",
    label: "Vendor",
    bot: 'Do you have a link to the vendor\'s privacy policy? Paste it, or say "not sure."',
    type: "text",
    placeholder: "https:// ... or 'not sure'",
  },
];

function visibleSteps(answers) {
  return STEPS.filter((s) => !(s.skip && s.skip(answers)));
}

function findFirstStepIndex(answers) {
  let i = 0;
  while (i < STEPS.length && STEPS[i].skip && STEPS[i].skip(answers)) {
    i++;
  }
  return i;
}

function RequesterChat({ requestId }) {
  const [answers, setAnswers] = useState({});
  const [log, setLog] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [multiSelected, setMultiSelected] = useState([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(Boolean(requestId));
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [pendingAnswers, setPendingAnswers] = useState(null);
  const scrollRef = useRef(null);

  const persistReview = useCallback(
    async (finalAnswers) => {
      if (!requestId) {
        setDone(true);
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const it_review = answersToItReview(finalAnswers);
        await submitChatbotReview(requestId, it_review);
        setPendingAnswers(null);
        setDone(true);
        setLog((l) => {
          const already = l.some((e) => e.label === "Submitted");
          if (already) return l;
          return [
            ...l,
            {
              from: "bot",
              label: "Submitted",
              text: "Thanks — that's everything I need. Your request has been submitted for IT Review.",
            },
          ];
        });
      } catch (err) {
        setPendingAnswers(finalAnswers);
        setSubmitError(err.message || "Could not save your answers. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [requestId]
  );

  // Load the intake record once per requestId.
  // Important: do NOT gate on a "bootstrapped" ref — React Strict Mode
  // runs effect → cleanup → effect again on the same instance, which would
  // leave loading stuck forever after cancelling the first fetch.
  useEffect(() => {
    if (!requestId) {
      setLog([{ from: "bot", label: STEPS[0].label, text: STEPS[0].bot }]);
      setStepIndex(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const record = await getRequest(requestId);
        if (cancelled) return;
        const requestor = record.requestor || {};
        const seeded = {
          software_name: requestor.software_name || undefined,
          scope_of_usage: requestor.scope_of_usage || undefined,
        };
        Object.keys(seeded).forEach((k) => seeded[k] === undefined && delete seeded[k]);

        const startIndex = findFirstStepIndex(seeded);
        setAnswers(seeded);
        setStepIndex(startIndex);
        if (startIndex < STEPS.length) {
          setLog([{ from: "bot", label: STEPS[startIndex].label, text: STEPS[startIndex].bot }]);
        } else if (!cancelled) {
          await persistReview(seeded);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || "Could not load this request.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, persistReview]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [log, submitError]);

  const currentStep = STEPS[stepIndex];
  const visible = useMemo(() => visibleSteps(answers), [answers]);
  const visiblePosition = currentStep ? visible.findIndex((s) => s.id === currentStep.id) : -1;

  function findNextIndex(fromIndex, updatedAnswers) {
    let i = fromIndex + 1;
    while (i < STEPS.length && STEPS[i].skip && STEPS[i].skip(updatedAnswers)) {
      i++;
    }
    return i;
  }

  function goToStep(index, updatedAnswers) {
    if (index < STEPS.length) {
      setLog((l) => [...l, { from: "bot", label: STEPS[index].label, text: STEPS[index].bot }]);
      setStepIndex(index);
      setMultiSelected([]);
    } else {
      persistReview(updatedAnswers);
    }
  }

  function advance(value, displayText) {
    if (submitting) return;
    const updated = { ...answers, [currentStep.id]: value };
    setLog((l) => [...l, { from: "user", text: displayText }]);
    setAnswers(updated);
    setTimeout(() => goToStep(findNextIndex(stepIndex, updated), updated), 260);
  }

  function submitText() {
    const trimmed = textInput.trim();
    if (!trimmed) return;
    advance(trimmed, trimmed);
    setTextInput("");
  }

  function toggleMulti(value) {
    setMultiSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function submitMulti() {
    if (multiSelected.length === 0) return;
    const labels = currentStep.options
      .filter((o) => multiSelected.includes(o.value))
      .map((o) => o.label)
      .join(", ");
    advance(multiSelected, labels);
  }

  const totalVisible = visible.length;

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.masthead}>
            <div style={styles.badge}>SDSU</div>
            <div>
              <div style={styles.headline}>Software Request Assistant</div>
              <div style={styles.ticketRow}>
                {requestId ? `Request #${requestId.slice(0, 8)}` : "IT Review intake"}
              </div>
            </div>
          </div>
          <div style={styles.footer}>Loading your request…</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.masthead}>
            <div style={styles.badge}>SDSU</div>
            <div>
              <div style={styles.headline}>Software Request Assistant</div>
            </div>
          </div>
          <div style={{ ...styles.footer, color: "var(--red)" }}>{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Masthead */}
        <div style={styles.masthead}>
          <div style={styles.badge}>SDSU</div>
          <div>
            <div style={styles.headline}>Software Request Assistant</div>
            <div style={styles.ticketRow}>
              {requestId ? `Request #${requestId.slice(0, 8)}` : "IT Review intake"}
            </div>
          </div>
        </div>

        {/* Step sequence */}
        {!done && currentStep && (
          <React.Fragment>
            <div style={styles.dotsWrap}>
              {visible.map((s, i) => (
                <div key={s.id} style={styles.dotUnit}>
                  <div
                    style={{
                      ...styles.dot,
                      background:
                        i < visiblePosition ? "var(--red)" : i === visiblePosition ? "#fff" : "var(--paper-alt)",
                      borderColor: i <= visiblePosition ? "var(--red)" : "var(--line)",
                    }}
                  />
                  {i < visible.length - 1 && (
                    <div
                      style={{
                        ...styles.dotLine,
                        background: i < visiblePosition ? "var(--red)" : "var(--line)",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={styles.stepCaption}>
              Question {visiblePosition + 1} of {totalVisible} — {currentStep.label}
            </div>
          </React.Fragment>
        )}

        {/* Log */}
        <div ref={scrollRef} style={styles.log}>
          {log.map((entry, i) =>
            entry.from === "bot" ? (
              <div key={i} style={styles.botEntry}>
                <div style={styles.botRule} />
                <div>
                  <div style={styles.botLabel}>{entry.label}</div>
                  <div style={styles.botText}>{entry.text}</div>
                </div>
              </div>
            ) : (
              <div key={i} style={styles.userEntryWrap}>
                <div style={styles.userEntry}>{entry.text}</div>
              </div>
            )
          )}
        </div>

        {/* Input */}
        {submitting ? (
          <div style={styles.footer}>Saving your answers…</div>
        ) : submitError ? (
          <div style={styles.errorWrap}>
            <div style={styles.errorText}>{submitError}</div>
            <button
              style={styles.textSubmit}
              onClick={() => persistReview(pendingAnswers || answers)}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : !done && currentStep ? (
          currentStep.type === "choice" ? (
            <div style={styles.choiceList}>
              {currentStep.options.map((opt) => (
                <button
                  key={opt.value}
                  style={styles.choiceRow}
                  onClick={() => advance(opt.value, opt.label)}
                  onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = "var(--red)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = "transparent")}
                >
                  <span>{opt.label}</span>
                  <span style={styles.choiceMark}>&rarr;</span>
                </button>
              ))}
            </div>
          ) : currentStep.type === "multiselect" ? (
            <div style={styles.multiWrap}>
              <div style={styles.choiceList}>
                {currentStep.options.map((opt) => {
                  const active = multiSelected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      style={{
                        ...styles.choiceRow,
                        borderLeftColor: active ? "var(--red)" : "transparent",
                        background: active ? "var(--paper-alt)" : "transparent",
                      }}
                      onClick={() => toggleMulti(opt.value)}
                    >
                      <span>{opt.label}</span>
                      <span style={{ ...styles.choiceMark, opacity: active ? 1 : 0.25 }}>
                        {active ? "✓" : "○"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={styles.textRow}>
                <button style={styles.textSubmit} onClick={submitMulti} disabled={multiSelected.length === 0}>
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.textRow}>
              <input
                style={styles.textField}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitText()}
                placeholder={currentStep.placeholder}
                autoFocus
              />
              <button style={styles.textSubmit} onClick={submitText}>
                Enter
              </button>
            </div>
          )
        ) : (
          <div style={styles.footer}>Filed under Information Technology — routing complete.</div>
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
    padding: "40px 20px",
  },
  card: {
    width: "100%",
    maxWidth: "500px",
    background: "#FFFFFF",
    border: "1px solid var(--line)",
    borderRadius: "14px",
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.12)",
  },
  masthead: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "18px 24px",
    background: "var(--ink)",
  },
  badge: {
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
  headline: {
    fontFamily: "'Source Serif 4', serif",
    fontWeight: 600,
    fontSize: "18px",
    lineHeight: 1.2,
    color: "#fff",
  },
  ticketRow: {
    marginTop: "3px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11.5px",
    color: "var(--stone-light)",
  },
  dotsWrap: {
    display: "flex",
    alignItems: "center",
    padding: "18px 28px 0",
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
  stepCaption: {
    padding: "8px 28px 18px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--stone)",
    letterSpacing: "0.02em",
  },
  log: {
    padding: "0 28px",
    maxHeight: "420px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    paddingBottom: "22px",
    paddingTop: "18px",
  },
  botEntry: {
    display: "flex",
    gap: "12px",
  },
  botRule: {
    width: "2.5px",
    background: "var(--red)",
    borderRadius: "2px",
    flexShrink: 0,
  },
  botLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--red)",
    marginBottom: "4px",
  },
  botText: {
    fontSize: "15px",
    lineHeight: 1.5,
    color: "var(--ink)",
  },
  userEntryWrap: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userEntry: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "13px",
    color: "var(--ink)",
    background: "var(--paper-alt)",
    border: "1px solid var(--line)",
    padding: "6px 12px",
    maxWidth: "78%",
  },
  choiceList: {
    borderTop: "1px solid var(--line)",
    display: "flex",
    flexDirection: "column",
  },
  choiceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 28px",
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
  choiceMark: {
    color: "var(--red)",
    fontSize: "14px",
    opacity: 0.7,
  },
  multiWrap: { display: "flex", flexDirection: "column" },
  textRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "18px 28px 24px",
    borderTop: "1px solid var(--line)",
  },
  textField: {
    flex: 1,
    border: "none",
    borderBottom: "1.5px solid var(--stone-light)",
    background: "transparent",
    fontSize: "15px",
    padding: "6px 2px",
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: "var(--ink)",
  },
  textSubmit: {
    border: "1px solid var(--ink)",
    background: "var(--ink)",
    color: "#fff",
    fontSize: "12.5px",
    letterSpacing: "0.04em",
    padding: "9px 16px",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  footer: {
    padding: "16px 28px 22px",
    borderTop: "1px solid var(--line)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    color: "var(--stone)",
    textAlign: "center",
  },
  errorWrap: {
    padding: "16px 28px 22px",
    borderTop: "1px solid var(--line)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  errorText: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "12px",
    color: "var(--red)",
    textAlign: "center",
  },
};

export default RequesterChat;
