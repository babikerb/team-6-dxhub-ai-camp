/**
 * Convert flat chatbot answers into the frozen it_review schema
 * from Implementation_Plan.md (canonical labels + booleans).
 */

const INTERACTION_MAP = {
  computer: "Computer",
  mobile: "Mobile",
  browser: "Web browser",
  "not sure": "Not sure",
};

const CATEGORY_MAP = {
  "onprem-datacenter": "On-prem Data Center",
  "onprem-local": "On-prem Local",
  cloud: "Cloud",
  addon: "Add-on/Plugin",
};

const SSO_MAP = {
  yes: "true",
  no: "false",
  unsure: "not_sure",
};

function isNegativeText(value) {
  if (value == null) return true;
  const t = String(value).trim().toLowerCase();
  return t === "" || t === "no" || t === "n" || t === "none" || t === "n/a" || t === "na";
}

function isNotSureText(value) {
  if (value == null) return true;
  const t = String(value).trim().toLowerCase();
  return t === "" || t === "not sure" || t === "unsure" || t === "n/a" || t === "na" || t === "none";
}

/**
 * @param {Record<string, unknown>} answers - flat chatbot answer map
 * @returns {object} canonical it_review object
 */
export function answersToItReview(answers) {
  const level_1_categories = [];
  if (answers.la_health === "yes") level_1_categories.push("HIPAA");
  if (answers.la_pii === "yes") level_1_categories.push("PII");
  if (answers.la_payment === "yes") {
    level_1_categories.push("PCI DSS");
    level_1_categories.push("GLBA");
  }
  if (answers.la_lawenforcement === "yes") level_1_categories.push("Law Enforcement Records");

  const level_2_categories = [];
  if (answers.lb_coursework === "yes") level_2_categories.push("FERPA");
  if (answers.lb_employee === "yes") level_2_categories.push("Employee Information");
  if (answers.lb_budget === "yes") level_2_categories.push("Financials");
  if (answers.lb_research === "yes") level_2_categories.push("Research/IP");
  if (answers.lb_legal === "yes") level_2_categories.push("Attorney-Client");

  const shares = answers.shares_data_with_campus_system === "yes";

  const rawMethods = Array.isArray(answers.interaction_method)
    ? answers.interaction_method
    : answers.interaction_method
      ? [answers.interaction_method]
      : [];
  const interaction_method = rawMethods.map((m) => INTERACTION_MAP[m] || m);

  const complianceRaw = answers.compliance_requirements;
  const compliance_requirements = !isNegativeText(complianceRaw);
  const compliance_note = compliance_requirements ? String(complianceRaw).trim() : null;

  const otherRaw = answers.other_data_category;
  const other_data_category = isNegativeText(otherRaw) ? null : String(otherRaw).trim();

  const privacyRaw = answers.vendor_privacy_policy_url;
  const vendor_privacy_policy_url = isNotSureText(privacyRaw) ? null : String(privacyRaw).trim();

  // AI / Automated Decision System tracking (California AB 302). Not part of
  // the original frozen schema -- added so ai_flag (backend store.py) has
  // something to compute from instead of silently losing these answers.
  const ai_capabilities = answers.ai_capabilities === "yes";
  const ai_use_description = ai_capabilities && answers.ai_use_description
    ? String(answers.ai_use_description).trim()
    : null;
  const ai_automated_decisions = answers.ai_automated_decisions === "yes";

  return {
    estimated_users: answers.estimated_users || null,
    interaction_method,
    software_category: CATEGORY_MAP[answers.software_category] || answers.software_category || null,
    shares_data_with_campus_system: shares,
    integration_explanation: shares
      ? answers.integration_explanation
        ? String(answers.integration_explanation).trim()
        : null
      : null,
    sso_capable: SSO_MAP[answers.sso_capable] || answers.sso_capable || "not_sure",
    level_1_data: level_1_categories.length > 0,
    level_1_categories,
    level_2_data: level_2_categories.length > 0,
    level_2_categories,
    other_data_category,
    compliance_requirements,
    compliance_note,
    vendor_privacy_policy_url,
    ai_capabilities,
    ai_use_description,
    ai_automated_decisions,
  };
}
