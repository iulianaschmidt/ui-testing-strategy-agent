import type { GraphClient } from "./client.js";
import type { GraphDriveItem, GraphSite } from "./types.js";

export interface ResolvedSourceFolder {
  driveId: string;
  itemId: string;
  webUrl: string;
  name: string;
}

export function encodeSharingUrl(url: string): string {
  return `u!${Buffer.from(url, "utf8")
    .toString("base64")
    .replace(/=+$/u, "")
    .replace(/\//gu, "_")
    .replace(/\+/gu, "-")}`;
}

export async function resolveSourceFolder(
  client: GraphClient,
  sourceFolderUrl: string,
): Promise<ResolvedSourceFolder> {
  const shareId = encodeSharingUrl(sourceFolderUrl);
  const item = await client.request<GraphDriveItem>(
    `/shares/${shareId}/driveItem?$select=id,name,webUrl,folder,parentReference`,
  );
  const driveId = item.parentReference?.driveId;
  if (!item.folder || !driveId || !item.webUrl) {
    throw new Error("The source URL did not resolve to a SharePoint folder with a drive identity");
  }
  return { driveId, itemId: item.id, webUrl: item.webUrl, name: item.name };
}

export async function resolveSite(client: GraphClient, siteUrl: string): Promise<GraphSite> {
  const parsed = new URL(siteUrl);
  const path = parsed.pathname.replace(/\/+$/u, "") || "/";
  return client.request<GraphSite>(
    `/sites/${encodeURIComponent(parsed.hostname)}:${encodeURI(path)}?$select=id,displayName,webUrl`,
  );
}
