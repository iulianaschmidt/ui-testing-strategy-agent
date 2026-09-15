import type { SourceEvidence } from "../domain/models.js";
import type { GraphClient } from "./client.js";
import type { GraphDriveItem } from "./types.js";
import type { ResolvedSourceFolder } from "./url-resolver.js";

export interface SourceDocument extends Omit<SourceEvidence, "status"> {
  status: "available";
}

export interface SourceReader {
  listDocuments(): Promise<SourceDocument[]>;
  download(document: SourceDocument): Promise<Buffer>;
}

export class SharePointSourceReader implements SourceReader {
  constructor(
    private readonly client: GraphClient,
    private readonly root: ResolvedSourceFolder,
  ) {}

  async listDocuments(): Promise<SourceDocument[]> {
    const documents: SourceDocument[] = [];
    await this.walk(this.root.itemId, this.root.name, documents);
    return documents;
  }

  async download(document: SourceDocument): Promise<Buffer> {
    return this.client.request<Buffer>(
      `/drives/${encodeURIComponent(document.sourceDriveId)}/items/${encodeURIComponent(document.sourceItemId)}/content`,
      { responseType: "buffer" },
    );
  }

  private async walk(
    folderItemId: string,
    currentPath: string,
    output: SourceDocument[],
  ): Promise<void> {
    const items = await this.client.collect<GraphDriveItem>(
      `/drives/${encodeURIComponent(this.root.driveId)}/items/${encodeURIComponent(folderItemId)}/children?$select=id,name,size,webUrl,eTag,lastModifiedDateTime,file,folder,parentReference`,
    );
    for (const item of items) {
      const path = `${currentPath}/${item.name}`;
      if (item.folder) {
        await this.walk(item.id, path, output);
        continue;
      }
      if (!item.file || !item.webUrl) continue;
      output.push({
        sourceDriveId: item.parentReference?.driveId ?? this.root.driveId,
        sourceItemId: item.id,
        sourceLink: item.webUrl,
        name: item.name,
        path,
        size: item.size ?? 0,
        status: "available",
        ...(item.file.mimeType ? { mimeType: item.file.mimeType } : {}),
        ...(item.eTag ? { etag: item.eTag } : {}),
        ...(item.lastModifiedDateTime ? { lastModifiedDateTime: item.lastModifiedDateTime } : {}),
      });
    }
  }
}
