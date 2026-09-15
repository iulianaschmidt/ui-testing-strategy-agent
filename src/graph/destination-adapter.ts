import type { DerivedRecord } from "../domain/models.js";
import { listNameForRecord } from "../domain/list-manifests.js";
import type { GraphClient } from "./client.js";
import type { GraphList, GraphListItem } from "./types.js";

export interface DestinationRecord {
  itemId: string;
  etag?: string;
  fields: Record<string, unknown>;
}

export interface DestinationWriter {
  findByKey(listName: string, key: string): Promise<DestinationRecord[]>;
  listByScope(listName: string, sourceScopeKey: string): Promise<DestinationRecord[]>;
  create(record: DerivedRecord): Promise<DestinationRecord>;
  update(
    itemId: string,
    etag: string | undefined,
    record: DerivedRecord,
  ): Promise<DestinationRecord>;
}

export class SharePointDestinationWriter implements DestinationWriter {
  readonly #listIds = new Map<string, string>();

  constructor(
    private readonly client: GraphClient,
    private readonly siteId: string,
  ) {}

  async findByKey(listName: string, key: string): Promise<DestinationRecord[]> {
    const listId = await this.listId(listName);
    const escaped = key.replace(/'/gu, "''");
    const items = await this.client.collect<GraphListItem>(
      `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/items?expand=fields&$filter=fields/StableKey eq '${escaped}'`,
    );
    return items.map((item) => ({
      itemId: item.id,
      ...((item.eTag ?? item["@odata.etag"]) ? { etag: item.eTag ?? item["@odata.etag"] } : {}),
      fields: item.fields,
    }));
  }

  async listByScope(listName: string, sourceScopeKey: string): Promise<DestinationRecord[]> {
    const listId = await this.listId(listName);
    const escaped = sourceScopeKey.replace(/'/gu, "''");
    const items = await this.client.collect<GraphListItem>(
      `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/items?expand=fields&$filter=fields/SourceScopeKey eq '${escaped}'`,
    );
    return items.map((item) => ({
      itemId: item.id,
      ...((item.eTag ?? item["@odata.etag"]) ? { etag: item.eTag ?? item["@odata.etag"] } : {}),
      fields: item.fields,
    }));
  }

  async create(record: DerivedRecord): Promise<DestinationRecord> {
    const listId = await this.listId(listNameForRecord(record.kind));
    const item = await this.client.request<GraphListItem>(
      `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/items`,
      { method: "POST", body: { fields: toListFields(record) } },
    );
    const etag = item.eTag ?? item["@odata.etag"];
    return { itemId: item.id, ...(etag ? { etag } : {}), fields: item.fields };
  }

  async update(
    itemId: string,
    etag: string | undefined,
    record: DerivedRecord,
  ): Promise<DestinationRecord> {
    const listId = await this.listId(listNameForRecord(record.kind));
    const fields = await this.client.request<Record<string, unknown>>(
      `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}/fields`,
      {
        method: "PATCH",
        body: toListFields(record),
        headers: { "If-Match": etag ?? "*" },
      },
    );
    return { itemId, fields };
  }

  private async listId(displayName: string): Promise<string> {
    const cached = this.#listIds.get(displayName);
    if (cached) return cached;
    const lists = await this.client.collect<GraphList>(
      `/sites/${encodeURIComponent(this.siteId)}/lists?$select=id,displayName`,
    );
    const matches = lists.filter((list) => list.displayName === displayName);
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one destination list named "${displayName}", found ${matches.length}`,
      );
    }
    const id = matches[0]!.id;
    this.#listIds.set(displayName, id);
    return id;
  }
}

export function toListFields(record: DerivedRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    Title: record.title,
    StableKey: record.key,
    SourceScopeKey: record.sourceScopeKey,
    SourceLink: record.sourceLink,
    SourceDriveId: record.sourceDriveId,
    SourceItemId: record.sourceItemId,
    SourceStatus: record.sourceStatus,
    AnalysisRunId: record.analysisRunId,
    Classification: record.classification,
    Confidence: record.confidence,
    ReviewRequired: record.reviewRequired,
    AssertionKind: record.provenance.assertionKind,
    ContentHash: record.contentHash ?? "",
    RulesVersion: record.rulesVersion,
    DetailsJson: JSON.stringify(record.details),
    ConflictsJson: JSON.stringify(record.conflicts),
    Rationale: record.provenance.rationale,
    EvidenceExcerpt: record.provenance.excerpt ?? "",
  };
  if (record.kind === "analysis-run") {
    fields.RunStatus = "analyzed";
    fields.PlanDigest = "";
    fields.ApprovedBy = "";
  }
  return fields;
}
