import React, { useState, useRef, useEffect, useMemo } from "react";
import { converseTurn, assistText, PARSEABLE, ASSISTED_TEXT } from "./chatbotParse.js";

// -----------------------------------------------------------------
// MASTER QUESTION LIST (Part B)
// Each step: id, label (short tag shown next to bot message), bot text,
// type: "text" | "choice" | "multiselect",
// options (for choice/multiselect),
// skip(answers) -> true if this step should be skipped given answers so far
// -----------------------------------------------------------------
const STEPS = [
  {
    id: "software_name",
    label: "Item",
    bot: "What's the name of the software you're requesting?",
    type: "text",
    placeholder: "e.g. Zoom, Adobe Creative Cloud",
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
  // AI capabilities — California Automated Decision System (ADS) tracking, AB 302.
  // Captured up front so SDSU can inventory AI/ADS software instead of after the fact.
  {
    id: "ai_capabilities",
    label: "AI",
    bot: "Does this software use artificial intelligence — for example, generating content, giving recommendations, scoring, or making automated decisions?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
      { label: "Not sure", value: "unsure" },
    ],
  },
  {
    id: "ai_use_description",
    label: "AI",
    bot: "What do those AI features do, and how do you plan to use them?",
    type: "text",
    placeholder: "e.g. drafts email replies; suggests grades on quizzes",
    skip: (a) => a.ai_capabilities !== "yes",
  },
  {
    id: "ai_automated_decisions",
    label: "AI",
    bot: "Will it be used to help make decisions about people — like admissions, grading, hiring, financial aid, or evaluating individuals?",
    type: "choice",
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
      { label: "Not sure", value: "unsure" },
    ],
    skip: (a) => a.ai_capabilities !== "yes",
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

// -----------------------------------------------------------------
// PART C — flag computation logic (mirrors the Python spec exactly)
// Computed silently. Never rendered to the requester — staff/admin only.
// -----------------------------------------------------------------
export function evaluate(a) {
  const scopeQualifies = a.scope_of_usage === "Classroom" || a.scope_of_usage === "University";
  const highUsers = a.estimated_users === "30-100" || a.estimated_users === "100+";
  const ati_flag = highUsers && scopeQualifies;
  const ati_flag_reason = `${a.estimated_users} users, ${a.scope_of_usage} scope`;

  const blockA = {
    HIPAA: a.la_health === "yes",
    PII: a.la_pii === "yes",
    "PCI DSS / GLBA": a.la_payment === "yes",
    "Law Enforcement Records": a.la_lawenforcement === "yes",
  };
  const blockATriggered = Object.keys(blockA).filter((k) => blockA[k]);

  const blockB = {
    FERPA: a.lb_coursework === "yes",
    "Employee Information": a.lb_employee === "yes",
    Financials: a.lb_budget === "yes",
    "Research/IP": a.lb_research === "yes",
    "Attorney-client": a.lb_legal === "yes",
  };
  const blockBTriggered = Object.keys(blockB).filter((k) => blockB[k]);

  let risk_level, security_flag, security_flag_reason;
  if (blockATriggered.length > 0) {
    risk_level = "High";
    security_flag = true;
    security_flag_reason = "Level 1 data: " + blockATriggered.join(", ");
  } else if (blockBTriggered.length > 0) {
    risk_level = "Medium";
    security_flag = true;
    security_flag_reason = "Level 2 data: " + blockBTriggered.join(", ");
  } else {
    risk_level = "Low";
    security_flag = false;
    security_flag_reason = "No Level 1 or Level 2 data identified";
  }

  const integration_flag = a.shares_data_with_campus_system === "yes";
  const integration_flag_reason =
    a.integration_explanation || (integration_flag ? "Shares data with another campus system" : null);

  // AI / Automated Decision System tracking (California AB 302). ai_flag marks
  // any AI-enabled software; the reason calls out the high-risk ADS subset
  // (used to make decisions about people) that goes on the state inventory.
  const ai_flag = a.ai_capabilities === "yes";
  let ai_flag_reason;
  if (a.ai_automated_decisions === "yes") {
    ai_flag_reason = "AI-enabled automated decision system — California ADS inventory (AB 302)";
  } else if (ai_flag) {
    ai_flag_reason = "AI-enabled software";
  } else {
    ai_flag_reason = "No AI capabilities reported";
  }

  return {
    ati_flag,
    ati_flag_reason,
    security_flag,
    security_flag_reason,
    risk_level,
    integration_flag,
    integration_flag_reason,
    ai_flag,
    ai_flag_reason,
  };
}

function RequesterChat({ requestId }) {
  const [answers, setAnswers] = useState({});
  const [log, setLog] = useState([{ from: "bot", label: STEPS[0].label, text: STEPS[0].bot }]);
  const [stepIndex, setStepIndex] = useState(0); // index into full STEPS array
  const [textInput, setTextInput] = useState("");
  const [multiSelected, setMultiSelected] = useState([]);
  const [done, setDone] = useState(false);
  // Conversational (Bedrock) state for parseable choice questions:
  const [parsing, setParsing] = useState(false);       // waiting on the model
  const [pending, setPending] = useState(null);        // {value,label} awaiting confirm
  const [revealButtons, setRevealButtons] = useState(false); // model laid out options
  const [convo, setConvo] = useState([]);              // per-question turn history
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [log]);

  const currentStep = STEPS[stepIndex];
  const visible = useMemo(() => visibleSteps(answers), [answers]);
  const visiblePosition = visible.findIndex((s) => s.id === currentStep.id);

  function findNextIndex(fromIndex, updatedAnswers) {
    let i = fromIndex + 1;
    while (i < STEPS.length && STEPS[i].skip && STEPS[i].skip(updatedAnswers)) {
      i++;
    }
    return i;
  }

  function goToStep(index, updatedAnswers) {
    // reset per-question conversational state
    setPending(null);
    setRevealButtons(false);
    setParsing(false);
    setConvo([]);
    if (index < STEPS.length) {
      setLog((l) => [...l, { from: "bot", label: STEPS[index].label, text: STEPS[index].bot }]);
      setStepIndex(index);
      setMultiSelected([]);
    } else {
      setLog((l) => [
        ...l,
        {
          from: "bot",
          label: "Submitted",
          text: "Thanks — that's everything I need. Your request has been submitted for IT Review.",
        },
      ]);
      // Flags are computed here for the reviewer dashboard, but intentionally never shown to the requester.
      const flags = evaluate(updatedAnswers);
      console.log("Computed flags (staff/admin only):", flags);
      setDone(true);
    }
  }

  // Commit an answer WITHOUT logging a user bubble (caller already logged it).
  function commitAnswer(value, updatedAnswers) {
    const updated = updatedAnswers || { ...answers, [currentStep.id]: value };
    setAnswers(updated);
    setTimeout(() => goToStep(findNextIndex(stepIndex, updated), updated), 260);
  }

  function advance(value, displayText) {
    setLog((l) => [...l, { from: "user", text: displayText }]);
    commitAnswer(value);
  }

  // --- Conversational path (Bedrock parsing + clarification cascade) --------
  // Used for choice questions the parser understands. The requester types a
  // plain-English answer; we parse it to a fixed option with a confidence, then
  // either confirm, or fall back to the option buttons.
  const isConversational =
    currentStep.type === "choice" && PARSEABLE.has(currentStep.id);

  // Run one conversational turn given the updated history for this question.
  async function runTurn(history) {
    setParsing(true);
    setPending(null);
    try {
      const ctx = {
        software_name: answers.software_name,
        use_description: answers.use_description,
      };
      const r = await converseTurn(currentStep.id, currentStep.bot, history, ctx);
      const botMsg = (r.message || "").trim() || "Could you tell me a little more?";
      // record the assistant's turn in both the visible log and the history
      setLog((l) => [...l, { from: "bot", label: "AI", text: botMsg }]);
      setConvo([...history, { role: "assistant", text: botMsg }]);
      if (r.show_options) setRevealButtons(true);

      if (r.status === "resolved" && r.answer) {
        const opt = currentStep.options.find((o) => o.value === r.answer);
        // The model's message already asks them to confirm; show Yes/No.
        setPending({ value: r.answer, label: opt ? opt.label : r.answer });
      }
    } catch (e) {
      setLog((l) => [
        ...l,
        { from: "bot", label: "AI", text: "I'm having trouble reaching the assistant right now — you can choose an option below." },
      ]);
      setRevealButtons(true);
    } finally {
      setParsing(false);
    }
  }

  async function submitFreeText() {
    const text = textInput.trim();
    if (!text || parsing) return;
    setLog((l) => [...l, { from: "user", text }]);
    setTextInput("");
    const history = [...convo, { role: "user", text }];
    setConvo(history);
    await runTurn(history);
  }

  function confirmYes() {
    if (!pending) return;
    setLog((l) => [...l, { from: "user", text: "Yes, that's right" }]);
    const value = pending.value;
    setPending(null);
    commitAnswer(value);
  }

  // "No" doesn't dump to buttons — it keeps the conversation going.
  async function confirmNo() {
    setPending(null);
    const text = "No, that's not quite it";
    setLog((l) => [...l, { from: "user", text }]);
    const history = [...convo, { role: "user", text }];
    setConvo(history);
    await runTurn(history);
  }

  async function submitText() {
    const trimmed = textInput.trim();
    if (!trimmed || parsing) return;
    // Open-text questions that get a confusion check before we accept the answer.
    if (ASSISTED_TEXT.has(currentStep.id)) {
      setLog((l) => [...l, { from: "user", text: trimmed }]);
      setTextInput("");
      setParsing(true);
      try {
        const ctx = {
          software_name: answers.software_name,
          vendor_website: answers.vendor_website,
        };
        const r = await assistText(currentStep.id, currentStep.bot, trimmed, ctx);
        if (r.is_answer) {
          commitAnswer(trimmed);
        } else {
          setLog((l) => [
            ...l,
            { from: "bot", label: "AI", text: r.message || "Could you tell me a bit more?" },
          ]);
        }
      } catch (e) {
        commitAnswer(trimmed); // fail open: never wedge the form
      } finally {
        setParsing(false);
      }
      return;
    }
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
        {!done && (
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
        {!done ? (
          pending ? (
            <div style={styles.choiceList}>
              <button style={styles.choiceRow} onClick={confirmYes}>
                <span>Yes, that's right</span>
                <span style={styles.choiceMark}>&rarr;</span>
              </button>
              <button style={styles.choiceRow} onClick={confirmNo}>
                <span>No, let me choose</span>
                <span style={styles.choiceMark}>&rarr;</span>
              </button>
            </div>
          ) : isConversational ? (
            <div style={styles.multiWrap}>
              <div style={styles.textRow}>
                <input
                  style={styles.textField}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFreeText()}
                  placeholder={parsing ? "Thinking…" : "Answer in your own words…"}
                  disabled={parsing}
                  autoFocus
                />
                <button style={styles.textSubmit} onClick={submitFreeText} disabled={parsing}>
                  {parsing ? "…" : "Send"}
                </button>
              </div>
              {revealButtons && (
                <React.Fragment>
                  <div style={styles.orChoose}>or choose one</div>
                  <div style={styles.choiceList}>
                    {currentStep.options.map((opt) => (
                      <button
                        key={opt.value}
                        style={styles.choiceRow}
                        onClick={() => advance(opt.value, opt.label)}
                      >
                        <span>{opt.label}</span>
                        <span style={styles.choiceMark}>&rarr;</span>
                      </button>
                    ))}
                  </div>
                </React.Fragment>
              )}
            </div>
          ) : currentStep.type === "choice" ? (
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
                placeholder={parsing ? "Thinking…" : currentStep.placeholder}
                disabled={parsing}
                autoFocus
              />
              <button style={styles.textSubmit} onClick={submitText} disabled={parsing}>
                {parsing ? "…" : "Enter"}
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
    whiteSpace: "pre-wrap",
  },
  orChoose: {
    padding: "14px 28px 6px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "10.5px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--stone)",
    borderTop: "1px solid var(--line)",
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
};

export default RequesterChat;