export interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export interface GraphParentReference {
  driveId?: string;
  id?: string;
  path?: string;
}

export interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  eTag?: string;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  parentReference?: GraphParentReference;
}

export interface GraphSite {
  id: string;
  displayName?: string;
  webUrl?: string;
}

export interface GraphList {
  id: string;
  displayName: string;
  name?: string;
  webUrl?: string;
}

export interface GraphColumn {
  id: string;
  name: string;
  displayName?: string;
  indexed?: boolean;
  enforceUniqueValues?: boolean;
}

export interface GraphListItem {
  id: string;
  eTag?: string;
  "@odata.etag"?: string;
  fields: Record<string, unknown>;
}
