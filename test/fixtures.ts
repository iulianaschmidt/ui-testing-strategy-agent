import type { DerivedRecord, SourceEvidence } from "../src/domain/models.js";

export const sourceEvidence: SourceEvidence = {
  sourceDriveId: "drive-1",
  sourceItemId: "item-1",
  sourceLink: "https://contoso.sharepoint.com/sites/source/doc.docx",
  name: "checkout-requirements.md",
  path: "UI/checkout-requirements.md",
  mimeType: "text/markdown",
  size: 256,
  status: "available",
  text: [
    "The checkout form must retain entered values after validation.",
    "The checkout form must not retain entered values after validation.",
    "The layout should work with keyboard navigation.",
    "Bug 42 was fixed before release deployment.",
  ].join("\n"),
  contentHash: "abc123",
};

export const derivedRecord: DerivedRecord = {
  sourceScopeKey: "scope-1",
  sourceDriveId: "drive-1",
  sourceItemId: "item-1",
  sourceLink: "https://contoso.sharepoint.com/sites/source/doc.docx",
  key: "stable-key-1",
  kind: "evidence-index",
  title: "checkout-requirements.md",
  sourceStatus: "available",
  analysisRunId: "c39331f4-2c92-4b92-9848-72988927d2aa",
  classification: "requirement",
  confidence: 0.9,
  reviewRequired: false,
  conflicts: [],
  provenance: {
    assertionKind: "documented-fact",
    rationale: "Fixture",
  },
  details: { path: "UI/checkout-requirements.md" },
  contentHash: "abc123",
  rulesVersion: "1.0.0/1.0.0",
};
