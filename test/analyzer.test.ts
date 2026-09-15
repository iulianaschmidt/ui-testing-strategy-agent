import { describe, expect, it } from "vitest";

import { analyzeEvidence } from "../src/analysis/analyzer.js";
import type { RiskRulesConfig, TaxonomyConfig } from "../src/analysis/types.js";
import { sourceEvidence } from "./fixtures.js";

const taxonomy: TaxonomyConfig = {
  version: "1.0.0",
  evidenceTypes: [
    "requirement",
    "code",
    "design-note",
    "fixed-defect",
    "deployment-note",
    "mixed",
    "unclassified",
  ],
  riskCategories: ["accessibility", "deployment", "regression"],
  confidence: { high: 0.8, medium: 0.55, reviewBelow: 0.55 },
};
const riskRules: RiskRulesConfig = {
  version: "1.0.0",
  rules: [
    {
      id: "accessibility",
      terms: ["keyboard"],
      category: "accessibility",
      severity: "high",
      title: "Accessibility coverage",
    },
    {
      id: "fixed-defect",
      terms: ["fixed", "bug"],
      category: "regression",
      severity: "medium",
      title: "Regression coverage",
    },
  ],
};

describe("analyzeEvidence", () => {
  it("keeps provenance, flags conflicts, and separates facts from inference", () => {
    const result = analyzeEvidence(
      [sourceEvidence],
      "c39331f4-2c92-4b92-9848-72988927d2aa",
      "scope-1",
      taxonomy,
      riskRules,
      true,
    );

    const index = result.records.find((record) => record.kind === "evidence-index");
    const requirements = result.records.filter((record) => record.kind === "requirement");
    const scenarios = result.records.filter((record) => record.kind === "test-scenario");
    const risks = result.records.filter((record) => record.kind === "risk");

    expect(index?.conflicts).toHaveLength(1);
    expect(requirements.length).toBeGreaterThan(0);
    expect(
      requirements.every((record) => record.provenance.assertionKind === "documented-fact"),
    ).toBe(true);
    expect(scenarios.every((record) => record.provenance.assertionKind === "inference")).toBe(true);
    expect(risks.every((record) => record.provenance.assertionKind === "inference")).toBe(true);
    expect(result.records.every((record) => record.sourceDriveId && record.sourceItemId)).toBe(
      true,
    );
  });

  it("records extraction failures instead of silently dropping evidence", () => {
    const failed = {
      ...sourceEvidence,
      status: "unsupported" as const,
      text: undefined,
      failure: "Unsupported extension",
    };
    const result = analyzeEvidence(
      [failed],
      "c39331f4-2c92-4b92-9848-72988927d2aa",
      "scope-1",
      taxonomy,
      riskRules,
      false,
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.reviewRequired).toBe(true);
    expect(result.failures).toEqual([
      expect.objectContaining({ sourceItemId: failed.sourceItemId }),
    ]);
  });
});
