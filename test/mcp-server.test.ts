import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createMcpServer } from "../src/mcp/server.js";

describe("MCP server", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(closeables.splice(0).map((closeable) => closeable.close()));
  });

  it("exposes only the narrow workflow and reports missing configuration without auth", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer({});
    const client = new Client({ name: "test-client", version: "1.0.0" });
    closeables.push(client, server);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "analyze_source",
      "apply_schema",
      "apply_upsert",
      "approve_plan",
      "get_status",
      "preview_schema",
      "preview_upsert",
    ]);
    expect(tools.tools.some((tool) => tool.name.toLowerCase().includes("delete"))).toBe(false);

    const response = await client.callTool({ name: "get_status", arguments: {} });
    const content = z
      .array(z.object({ type: z.literal("text"), text: z.string() }))
      .parse(response.content);
    const status = z
      .object({
        configured: z.boolean(),
        missing: z.array(z.string()),
      })
      .passthrough()
      .parse(JSON.parse(content[0]!.text) as unknown);
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      "UI_EVIDENCE_TENANT_ID",
      "UI_EVIDENCE_CLIENT_ID",
      "UI_EVIDENCE_SOURCE_FOLDER_URL",
      "UI_EVIDENCE_DESTINATION_SITE_URL",
    ]);
  });
});
