import type { EvidenceTypeSchema } from "../domain/models.js";
import type { z } from "zod";

export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export interface TaxonomyConfig {
  version: string;
  evidenceTypes: EvidenceType[];
  riskCategories: string[];
  confidence: {
    high: number;
    medium: number;
    reviewBelow: number;
  };
}

export interface RiskRule {
  id: string;
  terms: string[];
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
}

export interface RiskRulesConfig {
  version: string;
  rules: RiskRule[];
}
