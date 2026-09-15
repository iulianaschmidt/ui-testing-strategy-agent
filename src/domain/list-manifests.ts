interface ColumnOptions {
  name: string;
  indexed?: boolean;
  enforceUniqueValues?: boolean;
}

export type ColumnDefinition = ColumnOptions &
  (
    | { text: { allowMultipleLines?: boolean; maxLength?: number } }
    | { boolean: Record<string, never> }
    | { number: { decimalPlaces?: string } }
    | { dateTime: { format: "dateTime" } }
  );

export interface ListManifest {
  displayName: string;
  columns: ColumnDefinition[];
}

const commonColumns: ColumnDefinition[] = [
  {
    name: "StableKey",
    indexed: true,
    enforceUniqueValues: true,
    text: { maxLength: 128 },
  },
  { name: "SourceScopeKey", indexed: true, text: { maxLength: 128 } },
  { name: "SourceLink", text: { maxLength: 2048 } },
  { name: "SourceDriveId", text: { maxLength: 255 } },
  { name: "SourceItemId", text: { maxLength: 255 } },
  { name: "SourceStatus", text: { maxLength: 64 } },
  { name: "AnalysisRunId", text: { maxLength: 64 } },
  { name: "Classification", text: { maxLength: 255 } },
  { name: "Confidence", number: { decimalPlaces: "automatic" } },
  { name: "ReviewRequired", boolean: {} },
  { name: "AssertionKind", text: { maxLength: 64 } },
  { name: "ContentHash", text: { maxLength: 128 } },
  { name: "RulesVersion", text: { maxLength: 64 } },
  { name: "DetailsJson", text: { allowMultipleLines: true } },
  { name: "ConflictsJson", text: { allowMultipleLines: true } },
  { name: "Rationale", text: { allowMultipleLines: true } },
  { name: "EvidenceExcerpt", text: { allowMultipleLines: true } },
];

export const LIST_MANIFESTS: readonly ListManifest[] = [
  { displayName: "UI Evidence Index", columns: commonColumns },
  { displayName: "Requirements and Risks", columns: commonColumns },
  { displayName: "Test Scenario Backlog", columns: commonColumns },
  {
    displayName: "Analysis Runs",
    columns: [
      ...commonColumns,
      { name: "RunStatus", text: { maxLength: 64 } },
      { name: "PlanDigest", text: { maxLength: 128 } },
      { name: "ApprovedBy", text: { maxLength: 255 } },
      { name: "ApprovedAt", dateTime: { format: "dateTime" } },
    ],
  },
] as const;

export function listNameForRecord(kind: string): string {
  switch (kind) {
    case "evidence-index":
      return "UI Evidence Index";
    case "requirement":
    case "risk":
      return "Requirements and Risks";
    case "test-scenario":
      return "Test Scenario Backlog";
    case "analysis-run":
      return "Analysis Runs";
    default:
      throw new Error(`Unsupported derived record kind: ${kind}`);
  }
}
