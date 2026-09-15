import type { ApplyResult, DerivedRecord, PlannedChange } from "../domain/models.js";
import { canonicalJson } from "../domain/identity.js";
import { listNameForRecord } from "../domain/list-manifests.js";
import { toListFields, type DestinationWriter } from "../graph/destination-adapter.js";

export async function planUpserts(
  records: DerivedRecord[],
  destination: DestinationWriter,
): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = [];
  for (const record of records) {
    const listName = listNameForRecord(record.kind);
    try {
      const existing = await destination.findByKey(listName, record.key);
      if (existing.length > 1) {
        changes.push({
          listName,
          action: "review",
          key: record.key,
          record,
          changedFields: [],
          reason: `Stable key is duplicated in destination (${existing.length} items)`,
        });
        continue;
      }
      if (existing.length === 0) {
        changes.push({
          listName,
          action: "create",
          key: record.key,
          record,
          changedFields: Object.keys(toListFields(record)).sort(),
        });
        continue;
      }

      const current = existing[0]!;
      const desiredFields = toListFields(record);
      const changedFields = Object.entries(desiredFields)
        .filter(([field, value]) => !fieldValuesEqual(current.fields[field], value))
        .map(([field]) => field)
        .sort();
      changes.push({
        listName,
        action: changedFields.length === 0 ? "unchanged" : "update",
        key: record.key,
        record,
        destinationItemId: current.itemId,
        ...(current.etag ? { destinationEtag: current.etag } : {}),
        changedFields,
      });
    } catch (error) {
      changes.push({
        listName,
        action: "review",
        key: record.key,
        record,
        changedFields: [],
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return changes;
}

export async function applyUpserts(
  planId: string,
  changes: PlannedChange[],
  destination: DestinationWriter,
): Promise<ApplyResult> {
  const outcomes: ApplyResult["outcomes"] = [];
  for (const change of changes) {
    if (change.action === "unchanged" || change.action === "review") {
      outcomes.push({
        key: change.key,
        listName: change.listName,
        status: change.action,
      });
      continue;
    }
    try {
      if (change.action === "create") {
        const existing = await destination.findByKey(change.listName, change.key);
        if (existing.length > 0) {
          throw new Error(
            `Stable key appeared after preview (${existing.length} destination item(s)); generate a new plan`,
          );
        }
        const created = await destination.create(change.record);
        outcomes.push({
          key: change.key,
          listName: change.listName,
          status: "created",
          itemId: created.itemId,
        });
      } else {
        if (!change.destinationItemId) {
          throw new Error("Update is missing the destination item ID");
        }
        const updated = await destination.update(
          change.destinationItemId,
          change.destinationEtag,
          change.record,
        );
        outcomes.push({
          key: change.key,
          listName: change.listName,
          status: "updated",
          itemId: updated.itemId,
        });
      }
    } catch (error) {
      outcomes.push({
        key: change.key,
        listName: change.listName,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const attempted = outcomes.filter(
    (outcome) =>
      outcome.status === "created" || outcome.status === "updated" || outcome.status === "failed",
  );
  const failures = attempted.filter((outcome) => outcome.status === "failed").length;
  const status =
    failures === 0 ? "succeeded" : failures === attempted.length ? "failed" : "partially-succeeded";
  return { planId, status, outcomes };
}

function fieldValuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") return left === right;
  return canonicalJson(left ?? null) === canonicalJson(right ?? null);
}
