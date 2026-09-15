import type { ColumnDefinition, ListManifest } from "../domain/list-manifests.js";
import type { GraphClient } from "./client.js";
import type { GraphColumn, GraphList } from "./types.js";

export type SchemaOperation =
  | { operation: "create-list"; listName: string }
  | {
      operation: "create-column";
      listName: string;
      listId?: string;
      column: ColumnDefinition;
    };

export interface SchemaManager {
  preview(manifests: readonly ListManifest[]): Promise<SchemaOperation[]>;
  apply(
    operations: SchemaOperation[],
  ): Promise<Array<{ operation: SchemaOperation; status: "created" | "failed"; error?: string }>>;
}

export class SharePointSchemaManager implements SchemaManager {
  constructor(
    private readonly client: GraphClient,
    private readonly siteId: string,
  ) {}

  async preview(manifests: readonly ListManifest[]): Promise<SchemaOperation[]> {
    const lists = await this.client.collect<GraphList>(
      `/sites/${encodeURIComponent(this.siteId)}/lists?$select=id,displayName`,
    );
    const operations: SchemaOperation[] = [];
    for (const manifest of manifests) {
      const matches = lists.filter((list) => list.displayName === manifest.displayName);
      if (matches.length > 1) {
        throw new Error(
          `Destination contains multiple lists named "${manifest.displayName}"; resolve duplicates before provisioning`,
        );
      }
      if (matches.length === 0) {
        operations.push({ operation: "create-list", listName: manifest.displayName });
        operations.push(
          ...manifest.columns.map((column): SchemaOperation => ({
            operation: "create-column",
            listName: manifest.displayName,
            column,
          })),
        );
        continue;
      }
      const columns = await this.columns(matches[0]!.id);
      for (const column of manifest.columns) {
        const existing = columns.find((candidate) => candidate.name === column.name);
        if (!existing) {
          operations.push({
            operation: "create-column",
            listName: manifest.displayName,
            listId: matches[0]!.id,
            column,
          });
          continue;
        }
        if (column.indexed && !existing.indexed) {
          throw new Error(
            `Existing column "${manifest.displayName}/${column.name}" must be indexed before use`,
          );
        }
        if (column.enforceUniqueValues && !existing.enforceUniqueValues) {
          throw new Error(
            `Existing column "${manifest.displayName}/${column.name}" must enforce unique values before use`,
          );
        }
      }
    }
    return operations;
  }

  async apply(operations: SchemaOperation[]) {
    const outcomes: Array<{
      operation: SchemaOperation;
      status: "created" | "failed";
      error?: string;
    }> = [];
    const listIds = await this.getListIds();
    const createdListIds = new Map<string, string>();

    for (const operation of operations) {
      try {
        if (operation.operation === "create-list") {
          if ((listIds.get(operation.listName) ?? []).length > 0) {
            throw new Error(
              `Destination changed after preview: list "${operation.listName}" now exists`,
            );
          }
          const created = await this.client.request<GraphList>(
            `/sites/${encodeURIComponent(this.siteId)}/lists`,
            {
              method: "POST",
              body: {
                displayName: operation.listName,
                list: { template: "genericList" },
              },
            },
          );
          listIds.set(operation.listName, [created.id]);
          createdListIds.set(operation.listName, created.id);
        } else {
          const matches = listIds.get(operation.listName) ?? [];
          const listId = operation.listId
            ? this.requireApprovedList(operation.listName, operation.listId, matches)
            : createdListIds.get(operation.listName);
          if (!listId)
            throw new Error(
              `List "${operation.listName}" was not created by this approved schema plan`,
            );
          await this.client.request<GraphColumn>(
            `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/columns`,
            { method: "POST", body: operation.column },
          );
        }
        outcomes.push({ operation, status: "created" });
      } catch (error) {
        outcomes.push({
          operation,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return outcomes;
  }

  private async getListIds(): Promise<Map<string, string[]>> {
    const lists = await this.client.collect<GraphList>(
      `/sites/${encodeURIComponent(this.siteId)}/lists?$select=id,displayName`,
    );
    const ids = new Map<string, string[]>();
    for (const list of lists) {
      ids.set(list.displayName, [...(ids.get(list.displayName) ?? []), list.id]);
    }
    return ids;
  }

  private requireApprovedList(listName: string, approvedListId: string, matches: string[]): string {
    if (matches.length !== 1 || matches[0] !== approvedListId) {
      throw new Error(
        `Destination changed after preview: list "${listName}" no longer resolves uniquely to the approved list`,
      );
    }
    return approvedListId;
  }

  private columns(listId: string): Promise<GraphColumn[]> {
    return this.client.collect<GraphColumn>(
      `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/columns?$select=id,name,displayName,indexed,enforceUniqueValues`,
    );
  }
}
