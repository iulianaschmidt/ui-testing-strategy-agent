import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { EvidenceTypeSchema } from "../domain/models.js";
import type { RiskRulesConfig, TaxonomyConfig } from "./types.js";

const TaxonomySchema = z.object({
  version: z.string().min(1),
  evidenceTypes: z.array(EvidenceTypeSchema),
  riskCategories: z.array(z.string().min(1)),
  confidence: z.object({
    high: z.number().min(0).max(1),
    medium: z.number().min(0).max(1),
    reviewBelow: z.number().min(0).max(1),
  }),
});

const RiskRulesSchema = z.object({
  version: z.string().min(1),
  rules: z.array(
    z.object({
      id: z.string().min(1),
      terms: z.array(z.string().min(1)).min(1),
      category: z.string().min(1),
      severity: z.enum(["low", "medium", "high", "critical"]),
      title: z.string().min(1),
    }),
  ),
});

export async function loadAnalysisConfig(
  repositoryRoot = process.cwd(),
): Promise<{ taxonomy: TaxonomyConfig; riskRules: RiskRulesConfig }> {
  const [taxonomyText, riskRulesText] = await Promise.all([
    readFile(path.join(repositoryRoot, "config", "taxonomy.json"), "utf8"),
    readFile(path.join(repositoryRoot, "config", "risk-rules.json"), "utf8"),
  ]);
  return {
    taxonomy: TaxonomySchema.parse(JSON.parse(taxonomyText)),
    riskRules: RiskRulesSchema.parse(JSON.parse(riskRulesText)),
  };
}
