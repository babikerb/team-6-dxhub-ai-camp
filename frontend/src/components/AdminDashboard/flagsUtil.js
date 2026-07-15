// Shared by AdminDashboard (list view) and ProcurementSearch (requester status
// stepper) — staff overrides win over the computed value, so this is what
// actually governs the request and what both views should key off of.
export function effectiveFlags(flags, admin) {
  const overrides = (admin && admin.overrides) || {};
  function effective(key) {
    const override = overrides[key];
    return {
      value: override !== null && override !== undefined ? override : flags[key],
      overridden: override !== null && override !== undefined,
    };
  }
  return {
    ati: effective("ati_flag"),
    security: effective("security_flag"),
    integration: effective("integration_flag"),
  };
}
