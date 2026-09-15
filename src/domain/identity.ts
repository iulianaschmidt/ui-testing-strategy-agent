import { createHash, randomUUID } from "node:crypto";

import type { DerivedRecordKind, SourceIdentity } from "./models.js";

export function stableRecordKey(
  source: SourceIdentity,
  kind: DerivedRecordKind,
  discriminator = "primary",
): string {
  const value = [
    source.sourceDriveId,
    source.sourceItemId,
    kind,
    discriminator.trim().toLowerCase(),
  ].join("\u001f");
  return createHash("sha256").update(value).digest("hex");
}

export function digestCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function newRunId(): string {
  return randomUUID();
}
