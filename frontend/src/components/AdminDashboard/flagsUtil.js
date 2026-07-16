// Shared by AdminDashboard (list view) and ProcurementSearch (requester status
// stepper) — staff overrides win over the computed value, so this is what
// actually governs the request and what both views should key off of.
export function effectiveFlags(flags, admin) {
  const overrides = (admin && admin.overrides) || {};
  // Older records predate review_completions — treat missing as "not completed".
  const completions = (admin && admin.review_completions) || {};
  function effective(key) {
    const override = overrides[key];
    return {
      value: override !== null && override !== undefined ? override : flags[key],
      overridden: override !== null && override !== undefined,
      completed: completions[key] === true,
    };
  }
  return {
    ati: effective("ati_flag"),
    security: effective("security_flag"),
    integration: effective("integration_flag"),
    // AI/ADS (California AB 302 tracking). No override or completion keys
    // exist server-side yet, so overridden/completed stay false for now.
    ai: effective("ai_flag"),
  };
}
