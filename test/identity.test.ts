import { describe, expect, it } from "vitest";

import { canonicalJson, digestCanonical, stableRecordKey } from "../src/domain/identity.js";

const source = {
  sourceDriveId: "drive",
  sourceItemId: "item",
  sourceLink: "https://example.sharepoint.com/item",
};

describe("stable identity", () => {
  it("is deterministic and separates record kinds", () => {
    expect(stableRecordKey(source, "requirement", "Login")).toBe(
      stableRecordKey(source, "requirement", " login "),
    );
    expect(stableRecordKey(source, "requirement", "Login")).not.toBe(
      stableRecordKey(source, "risk", "Login"),
    );
  });

  it("canonicalizes object keys before hashing", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(digestCanonical({ b: 2, a: 1 })).toBe(digestCanonical({ a: 1, b: 2 }));
  });
});
