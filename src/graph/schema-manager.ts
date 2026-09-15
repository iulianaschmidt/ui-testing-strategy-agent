import type { ColumnDefinition, ListManifest } from "../domain/list-manifests.js";
import type { GraphClient } from "./client.js";
import type { GraphColumn, GraphList } from "./types.js";

export type SchemaOperation =
  | { operation: "create-list"; listName: string }
  | { operation: "create-column"; listName: string; column: ColumnDefinition };

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

    for (const operation of operations) {
      try {
        if (operation.operation === "create-list") {
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
          listIds.set(operation.listName, created.id);
        } else {
          const listId = listIds.get(operation.listName);
          if (!listId) {
            throw new Error(`List "${operation.listName}" is unavailable for column creation`);
          }
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

  private async getListIds(): Promise<Map<string, string>> {
    const lists = await this.client.collect<GraphList>(
      `/sites/${encodeURIComponent(this.siteId)}/lists?$select=id,displayName`,
    );
    return new Map(lists.map((list) => [list.displayName, list.id]));
  }

  private columns(listId: string): Promise<GraphColumn[]> {
    return this.client.collect<GraphColumn>(
      `/sites/${encodeURIComponent(this.siteId)}/lists/${encodeURIComponent(listId)}/columns?$select=id,name,displayName,indexed,enforceUniqueValues`,
    );
  }
}
