import { describe, expect, it, vi } from "vitest";

import type { TokenProvider } from "../src/auth/token-provider.js";
import { GraphClient } from "../src/graph/client.js";

const tokenProvider: TokenProvider = {
  getAccessToken() {
    return Promise.resolve({ token: "test-token", accountId: "account-1" });
  },
};

describe("GraphClient", () => {
  it("follows pagination links", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: [{ id: "1" }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [{ id: "2" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new GraphClient(tokenProvider, fetchMock);
    await expect(client.collect<{ id: string }>("/items")).resolves.toEqual([
      { id: "1" },
      { id: "2" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns request IDs with Graph failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "forbidden" } }), {
        status: 403,
        headers: { "request-id": "request-123" },
      }),
    );
    const client = new GraphClient(tokenProvider, fetchMock);
    await expect(client.request("/items")).rejects.toEqual(
      expect.objectContaining({ status: 403, requestId: "request-123" }),
    );
  });

  it("does not retry writes whose outcome may be ambiguous", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "unavailable" } }), { status: 503 }),
      );
    const client = new GraphClient(tokenProvider, fetchMock);
    await expect(
      client.request("/items", { method: "POST", body: { fields: {} } }),
    ).rejects.toEqual(expect.objectContaining({ status: 503 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
