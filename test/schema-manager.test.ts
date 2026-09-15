import { describe, expect, it, vi } from "vitest";

import type { TokenProvider } from "../src/auth/token-provider.js";
import { LIST_MANIFESTS } from "../src/domain/list-manifests.js";
import { GraphClient } from "../src/graph/client.js";
import { SharePointSchemaManager } from "../src/graph/schema-manager.js";

const tokenProvider: TokenProvider = {
  getAccessToken() {
    return Promise.resolve({ token: "test-token", accountId: "account-1" });
  },
};

describe("SharePointSchemaManager", () => {
  it("rejects an existing list that becomes ambiguous after preview", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        value: [
          { id: "approved-list", displayName: "UI Evidence Index" },
          { id: "duplicate-list", displayName: "UI Evidence Index" },
        ],
      }),
    );
    const manager = new SharePointSchemaManager(
      new GraphClient(tokenProvider, fetchMock),
      "site-1",
    );

    const outcomes = await manager.apply([
      {
        operation: "create-column",
        listName: "UI Evidence Index",
        listId: "approved-list",
        column: LIST_MANIFESTS[0]!.columns[0]!,
      },
    ]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.status).toBe("failed");
    expect(outcomes[0]?.error).toContain("no longer resolves uniquely");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not adopt a list created by another actor after preview", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        value: [{ id: "concurrent-list", displayName: "UI Evidence Index" }],
      }),
    );
    const manager = new SharePointSchemaManager(
      new GraphClient(tokenProvider, fetchMock),
      "site-1",
    );

    const outcomes = await manager.apply([
      { operation: "create-list", listName: "UI Evidence Index" },
      {
        operation: "create-column",
        listName: "UI Evidence Index",
        column: LIST_MANIFESTS[0]!.columns[0]!,
      },
    ]);

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]?.status).toBe("failed");
    expect(outcomes[0]?.error).toContain("now exists");
    expect(outcomes[1]?.status).toBe("failed");
    expect(outcomes[1]?.error).toContain("was not created by this approved schema plan");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
