import { describe, expect, it } from "vitest";

import type { DestinationRecord, DestinationWriter } from "../src/graph/destination-adapter.js";
import { applyUpserts, planUpserts } from "../src/planning/upsert-planner.js";
import { derivedRecord } from "./fixtures.js";

class FakeDestination implements DestinationWriter {
  readonly created: string[] = [];
  readonly updated: string[] = [];

  constructor(
    private readonly records: DestinationRecord[] = [],
    private readonly failCreates = false,
  ) {}

  findByKey(): Promise<DestinationRecord[]> {
    return Promise.resolve(this.records);
  }

  listByScope(): Promise<DestinationRecord[]> {
    return Promise.resolve(this.records);
  }

  create() {
    if (this.failCreates) return Promise.reject(new Error("simulated Graph failure"));
    this.created.push(derivedRecord.key);
    return Promise.resolve({ itemId: "new", fields: {} });
  }

  update() {
    this.updated.push(derivedRecord.key);
    return Promise.resolve({ itemId: "existing", fields: {} });
  }
}

describe("upsert planning and apply", () => {
  it("plans idempotent create and unchanged operations", async () => {
    const createDestination = new FakeDestination();
    const createPlan = await planUpserts([derivedRecord], createDestination);
    expect(createPlan[0]?.action).toBe("create");

    const fields = {
      Title: derivedRecord.title,
      StableKey: derivedRecord.key,
      SourceScopeKey: derivedRecord.sourceScopeKey,
      SourceLink: derivedRecord.sourceLink,
      SourceDriveId: derivedRecord.sourceDriveId,
      SourceItemId: derivedRecord.sourceItemId,
      SourceStatus: derivedRecord.sourceStatus,
      AnalysisRunId: derivedRecord.analysisRunId,
      Classification: derivedRecord.classification,
      Confidence: derivedRecord.confidence,
      ReviewRequired: derivedRecord.reviewRequired,
      AssertionKind: derivedRecord.provenance.assertionKind,
      ContentHash: derivedRecord.contentHash,
      RulesVersion: derivedRecord.rulesVersion,
      DetailsJson: JSON.stringify(derivedRecord.details),
      ConflictsJson: JSON.stringify(derivedRecord.conflicts),
      Rationale: derivedRecord.provenance.rationale,
      EvidenceExcerpt: "",
    };
    const unchangedPlan = await planUpserts(
      [derivedRecord],
      new FakeDestination([{ itemId: "existing", fields }]),
    );
    expect(unchangedPlan[0]?.action).toBe("unchanged");
  });

  it("fails closed on duplicate destination keys", async () => {
    const plan = await planUpserts(
      [derivedRecord],
      new FakeDestination([
        { itemId: "1", fields: {} },
        { itemId: "2", fields: {} },
      ]),
    );
    expect(plan[0]).toEqual(expect.objectContaining({ action: "review" }));
  });

  it("reports partial failures and has no delete operation", async () => {
    const changes = await planUpserts([derivedRecord], new FakeDestination());
    const result = await applyUpserts("plan-1", changes, new FakeDestination([], true));
    expect(result.status).toBe("failed");
    expect(result.outcomes[0]).toEqual(
      expect.objectContaining({ status: "failed", error: "simulated Graph failure" }),
    );
    expect("delete" in FakeDestination.prototype).toBe(false);
  });

  it("rechecks a create key immediately before writing", async () => {
    const previewDestination = new FakeDestination();
    const changes = await planUpserts([derivedRecord], previewDestination);
    const concurrentDestination = new FakeDestination([{ itemId: "concurrent", fields: {} }]);
    const result = await applyUpserts("plan-1", changes, concurrentDestination);
    expect(result.status).toBe("failed");
    expect(result.outcomes[0]?.error).toMatch(/appeared after preview/u);
    expect(concurrentDestination.created).toHaveLength(0);
  });
});
