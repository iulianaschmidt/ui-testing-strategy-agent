import path from "node:path";

import type { DerivedRecord, SourceEvidence } from "../domain/models.js";
import { stableRecordKey } from "../domain/identity.js";
import type { EvidenceType, RiskRulesConfig, TaxonomyConfig } from "./types.js";

const REQUIREMENT_PATTERN = /\b(must|shall|should|required?|acceptance criteria)\b/iu;
const NEGATION_PATTERN = /\b(not|never|cannot|can't|mustn't|shouldn't)\b/iu;

export interface AnalysisResult {
  records: DerivedRecord[];
  failures: Array<{ sourceItemId: string; sourceLink: string; reason: string }>;
}

export function analyzeEvidence(
  evidence: SourceEvidence[],
  analysisRunId: string,
  sourceScopeKey: string,
  taxonomy: TaxonomyConfig,
  riskRules: RiskRulesConfig,
  storeExcerpts: boolean,
): AnalysisResult {
  const records: DerivedRecord[] = [];
  const failures: AnalysisResult["failures"] = [];

  for (const source of evidence) {
    const classification = classifyEvidence(source);
    const confidence =
      classification === "unclassified" ? 0.35 : classification === "mixed" ? 0.65 : 0.9;
    const conflicts = source.text ? findConflicts(source.text) : [];
    const reviewRequired =
      source.status !== "available" ||
      confidence < taxonomy.confidence.reviewBelow ||
      conflicts.length > 0;

    records.push({
      ...sourceIdentity(source),
      sourceScopeKey,
      key: stableRecordKey(source, "evidence-index"),
      kind: "evidence-index",
      title: source.name,
      sourceStatus: source.status,
      analysisRunId,
      classification,
      confidence,
      reviewRequired,
      conflicts,
      provenance: {
        assertionKind: "documented-fact",
        rationale:
          source.status === "available"
            ? "Classification is based on deterministic filename and content markers."
            : "The source item metadata is documented, but its content was not analyzed.",
      },
      details: {
        path: source.path,
        size: source.size,
        mimeType: source.mimeType ?? null,
        extractionFailure: source.failure ?? null,
      },
      ...(source.contentHash ? { contentHash: source.contentHash } : {}),
      rulesVersion: `${taxonomy.version}/${riskRules.version}`,
    });

    if (source.status !== "available" || !source.text) {
      failures.push({
        sourceItemId: source.sourceItemId,
        sourceLink: source.sourceLink,
        reason: source.failure ?? `Source status is ${source.status}`,
      });
      continue;
    }

    const statements = splitStatements(source.text);
    statements.forEach((statement, index) => {
      if (!REQUIREMENT_PATTERN.test(statement)) return;
      const excerpt = boundedExcerpt(statement, storeExcerpts);
      records.push({
        ...sourceIdentity(source),
        sourceScopeKey,
        key: stableRecordKey(source, "requirement", normalizeDiscriminator(statement)),
        kind: "requirement",
        title: shorten(statement, 180),
        sourceStatus: "available",
        analysisRunId,
        classification: "explicit-requirement",
        confidence: 0.92,
        reviewRequired: conflicts.some((conflict) => conflict.includes(shorten(statement, 60))),
        conflicts: conflicts.filter((conflict) => conflict.includes(shorten(statement, 60))),
        provenance: {
          assertionKind: "documented-fact",
          ...(excerpt ? { excerpt } : {}),
          rationale: `Statement ${index + 1} contains explicit requirement language.`,
        },
        details: { statement },
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        rulesVersion: `${taxonomy.version}/${riskRules.version}`,
      });

      records.push({
        ...sourceIdentity(source),
        sourceScopeKey,
        key: stableRecordKey(source, "test-scenario", normalizeDiscriminator(statement)),
        kind: "test-scenario",
        title: `Verify ${shorten(removeRequirementVerb(statement), 170)}`,
        sourceStatus: "available",
        analysisRunId,
        classification: "requirement-derived",
        confidence: 0.78,
        reviewRequired: false,
        conflicts: [],
        provenance: {
          assertionKind: "inference",
          ...(excerpt ? { excerpt } : {}),
          rationale: "Scenario intent was deterministically inferred from an explicit requirement.",
        },
        details: {
          preconditions: "Establish the state described by the source requirement.",
          intent: statement,
          expectedResult: statement,
          priority: "medium",
        },
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        rulesVersion: `${taxonomy.version}/${riskRules.version}`,
      });
    });

    for (const rule of riskRules.rules) {
      const matches = rule.terms.filter((term) =>
        source.text!.toLowerCase().includes(term.toLowerCase()),
      );
      if (matches.length === 0) continue;
      const excerpt = boundedExcerpt(findMatchingStatement(statements, matches), storeExcerpts);
      records.push({
        ...sourceIdentity(source),
        sourceScopeKey,
        key: stableRecordKey(source, "risk", rule.id),
        kind: "risk",
        title: rule.title,
        sourceStatus: "available",
        analysisRunId,
        classification: rule.category,
        confidence: Math.min(0.95, 0.55 + matches.length * 0.1),
        reviewRequired: matches.length === 1,
        conflicts: [],
        provenance: {
          assertionKind: "inference",
          ...(excerpt ? { excerpt } : {}),
          rationale: `Risk rule ${rule.id} matched: ${matches.join(", ")}.`,
        },
        details: { ruleId: rule.id, severity: rule.severity, matchedTerms: matches },
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        rulesVersion: `${taxonomy.version}/${riskRules.version}`,
      });
    }
  }

  return { records: deduplicate(records), failures };
}

function classifyEvidence(source: SourceEvidence): EvidenceType {
  if (source.status !== "available" || !source.text) return "unclassified";
  const sample = `${source.name}\n${source.text.slice(0, 20_000)}`.toLowerCase();
  const markers: Array<[EvidenceType, RegExp]> = [
    ["fixed-defect", /\b(fixed|resolved|bug|defect)\b/u],
    ["deployment-note", /\b(deploy|release|rollout|feature flag)\b/u],
    ["design-note", /\b(design|wireframe|mockup|ux|ui specification)\b/u],
    ["code", /\.(tsx?|jsx?|css|html|cs|java|py|go|rs)\b|function\s|class\s|const\s/u],
    ["requirement", REQUIREMENT_PATTERN],
  ];
  const matches = markers.filter(([, pattern]) => pattern.test(sample)).map(([type]) => type);
  if (matches.length === 0) return "unclassified";
  if (matches.length > 1) return "mixed";
  return matches[0]!;
}

function findConflicts(text: string): string[] {
  const statements = splitStatements(text).filter((statement) =>
    REQUIREMENT_PATTERN.test(statement),
  );
  const grouped = new Map<string, string[]>();
  for (const statement of statements) {
    const key = normalizeDiscriminator(statement.replace(NEGATION_PATTERN, ""));
    grouped.set(key, [...(grouped.get(key) ?? []), statement]);
  }
  return [...grouped.values()]
    .filter(
      (group) =>
        group.length > 1 &&
        group.some((statement) => NEGATION_PATTERN.test(statement)) &&
        group.some((statement) => !NEGATION_PATTERN.test(statement)),
    )
    .map((group) => `Potential contradiction: ${group.join(" | ")}`);
}

function splitStatements(text: string): string[] {
  return text
    .split(/(?:\n+|(?<=[.!?])\s+)/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length >= 8 && statement.length <= 2000);
}

function findMatchingStatement(statements: string[], terms: string[]): string {
  return (
    statements.find((statement) =>
      terms.some((term) => statement.toLowerCase().includes(term.toLowerCase())),
    ) ?? terms.join(", ")
  );
}

function sourceIdentity(source: SourceEvidence) {
  return {
    sourceDriveId: source.sourceDriveId,
    sourceItemId: source.sourceItemId,
    sourceLink: source.sourceLink,
  };
}

function normalizeDiscriminator(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 500);
}

function shorten(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1).trimEnd()}…`;
}

function removeRequirementVerb(value: string): string {
  return value.replace(/\b(must|shall|should|required? to)\b/iu, "").trim();
}

function boundedExcerpt(value: string, enabled: boolean): string | undefined {
  if (!enabled) return undefined;
  return shorten(value, 1000);
}

function deduplicate(records: DerivedRecord[]): DerivedRecord[] {
  const unique = new Map<string, DerivedRecord>();
  for (const record of records) unique.set(record.key, record);
  return [...unique.values()];
}

export function fileCategory(name: string): string {
  return path.extname(name).toLowerCase();
}
