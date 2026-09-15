import { z } from "zod";

export const EvidenceTypeSchema = z.enum([
  "requirement",
  "code",
  "design-note",
  "fixed-defect",
  "deployment-note",
  "mixed",
  "unclassified",
]);

export const ConfidenceSchema = z.number().min(0).max(1);
export const SourceStatusSchema = z.enum([
  "available",
  "unavailable",
  "unsupported",
  "oversized",
  "failed",
]);
export const AssertionKindSchema = z.enum(["documented-fact", "inference"]);

export const SourceIdentitySchema = z.object({
  sourceDriveId: z.string().min(1),
  sourceItemId: z.string().min(1),
  sourceLink: z.string().url(),
});
export type SourceIdentity = z.infer<typeof SourceIdentitySchema>;

export const SourceEvidenceSchema = SourceIdentitySchema.extend({
  name: z.string().min(1),
  path: z.string().min(1),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative(),
  etag: z.string().optional(),
  lastModifiedDateTime: z.string().datetime().optional(),
  status: SourceStatusSchema,
  text: z.string().optional(),
  contentHash: z.string().optional(),
  failure: z.string().optional(),
});
export type SourceEvidence = z.infer<typeof SourceEvidenceSchema>;

const ProvenanceSchema = z.object({
  assertionKind: AssertionKindSchema,
  excerpt: z.string().max(1000).optional(),
  rationale: z.string().min(1),
});

export const DerivedRecordKindSchema = z.enum([
  "evidence-index",
  "requirement",
  "risk",
  "test-scenario",
  "analysis-run",
]);
export type DerivedRecordKind = z.infer<typeof DerivedRecordKindSchema>;

export const DerivedRecordSchema = SourceIdentitySchema.extend({
  sourceScopeKey: z.string().min(1).max(128),
  key: z.string().min(1).max(128),
  kind: DerivedRecordKindSchema,
  title: z.string().min(1).max(255),
  sourceStatus: SourceStatusSchema,
  analysisRunId: z.string().uuid(),
  classification: z.string().min(1),
  confidence: ConfidenceSchema,
  reviewRequired: z.boolean(),
  conflicts: z.array(z.string()),
  provenance: ProvenanceSchema,
  details: z.record(z.string(), z.unknown()),
  contentHash: z.string().optional(),
  rulesVersion: z.string().min(1),
});
export type DerivedRecord = z.infer<typeof DerivedRecordSchema>;

export const ChangeActionSchema = z.enum(["create", "update", "unchanged", "review"]);
export type ChangeAction = z.infer<typeof ChangeActionSchema>;

export const PlannedChangeSchema = z.object({
  listName: z.string().min(1),
  action: ChangeActionSchema,
  key: z.string().min(1),
  record: DerivedRecordSchema,
  destinationItemId: z.string().optional(),
  destinationEtag: z.string().optional(),
  changedFields: z.array(z.string()),
  reason: z.string().optional(),
});
export type PlannedChange = z.infer<typeof PlannedChangeSchema>;

export const PlanKindSchema = z.enum(["schema", "upsert"]);
export type PlanKind = z.infer<typeof PlanKindSchema>;

export const ChangePlanSchema = z.object({
  planId: z.string().uuid(),
  kind: PlanKindSchema,
  digest: z.string().min(1),
  destinationSiteId: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  changes: z.array(PlannedChangeSchema),
  schemaOperations: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type ChangePlan = z.infer<typeof ChangePlanSchema>;

export const ApprovalSchema = z.object({
  planId: z.string().uuid(),
  digest: z.string().min(1),
  approvedBy: z.string().min(1),
  approvedAt: z.string().datetime(),
  confirmation: z.literal("I approve this exact plan"),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export interface ItemOutcome {
  key: string;
  listName: string;
  status: "created" | "updated" | "unchanged" | "review" | "failed";
  itemId?: string;
  error?: string;
}

export interface ApplyResult {
  planId: string;
  status: "succeeded" | "partially-succeeded" | "failed";
  outcomes: ItemOutcome[];
}
