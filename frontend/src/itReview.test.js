import { describe, it, expect } from "vitest";
import { answersToItReview } from "./itReview.js";

describe("answersToItReview", () => {
  it("normalizes chatbot answers into frozen it_review shape", () => {
    const itReview = answersToItReview({
      estimated_users: "30-100",
      interaction_method: ["computer", "mobile"],
      software_category: "cloud",
      shares_data_with_campus_system: "yes",
      integration_explanation: "Canvas grades",
      sso_capable: "yes",
      la_health: "no",
      la_pii: "no",
      la_payment: "no",
      la_lawenforcement: "no",
      lb_coursework: "yes",
      lb_employee: "no",
      lb_budget: "no",
      lb_research: "no",
      lb_legal: "no",
      other_data_category: "no",
      compliance_requirements: "no",
      vendor_privacy_policy_url: "not sure",
    });

    expect(itReview).toEqual({
      estimated_users: "30-100",
      interaction_method: ["Computer", "Mobile"],
      software_category: "Cloud",
      shares_data_with_campus_system: true,
      integration_explanation: "Canvas grades",
      sso_capable: "true",
      level_1_data: false,
      level_1_categories: [],
      level_2_data: true,
      level_2_categories: ["FERPA"],
      other_data_category: null,
      compliance_requirements: false,
      compliance_note: null,
      vendor_privacy_policy_url: null,
    });
  });

  it("maps Level 1 payment answers to PCI DSS and GLBA", () => {
    const itReview = answersToItReview({
      estimated_users: "1-30",
      interaction_method: ["browser"],
      software_category: "addon",
      shares_data_with_campus_system: "no",
      sso_capable: "unsure",
      la_health: "no",
      la_pii: "no",
      la_payment: "yes",
      la_lawenforcement: "no",
      other_data_category: "no",
      compliance_requirements: "GDPR for EU students",
      vendor_privacy_policy_url: "https://example.com/privacy",
    });

    expect(itReview.shares_data_with_campus_system).toBe(false);
    expect(itReview.integration_explanation).toBeNull();
    expect(itReview.sso_capable).toBe("not_sure");
    expect(itReview.level_1_data).toBe(true);
    expect(itReview.level_1_categories).toEqual(["PCI DSS", "GLBA"]);
    expect(itReview.compliance_requirements).toBe(true);
    expect(itReview.compliance_note).toBe("GDPR for EU students");
    expect(itReview.vendor_privacy_policy_url).toBe("https://example.com/privacy");
  });
});
