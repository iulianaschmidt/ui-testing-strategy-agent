import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MsalDeviceCodeTokenProvider } from "../auth/msal-token-provider.js";
import { inspectRuntimeConfig, loadRuntimeConfig } from "../config/runtime.js";
import { UiEvidenceService } from "../service/ui-evidence-service.js";

export function createMcpServer(environment: NodeJS.ProcessEnv = process.env): McpServer {
  const server = new McpServer({
    name: "ui-evidence",
    version: "0.1.0",
  });
  let service: UiEvidenceService | undefined;

  const getService = (): UiEvidenceService => {
    if (!service) {
      const config = loadRuntimeConfig(environment);
      service = new UiEvidenceService(config, {
        tokenProvider: new MsalDeviceCodeTokenProvider(config),
      });
    }
    return service;
  };

  server.registerTool(
    "get_status",
    {
      title: "Get UI evidence service status",
      description:
        "Validate required non-secret configuration without accessing SharePoint or prompting for sign-in.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => Promise.resolve(toolResult(inspectRuntimeConfig(environment))),
  );

  server.registerTool(
    "analyze_source",
    {
      title: "Analyze SharePoint source evidence",
      description:
        "Read the configured source folder, extract supported evidence, and derive traceable records without destination writes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const result = await getService().analyzeSource();
      return toolResult({
        runId: result.runId,
        sourceCount: result.sourceCount,
        derivedRecordCount: result.records.length,
        reviewRequiredCount: result.records.filter((record) => record.reviewRequired).length,
        failures: result.failures,
        records: result.records,
      });
    },
  );

  server.registerTool(
    "preview_schema",
    {
      title: "Preview destination schema changes",
      description:
        "Compare required lists and columns with the destination and return a non-mutating, expiring plan.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => toolResult(await getService().previewSchema()),
  );

  server.registerTool(
    "preview_upsert",
    {
      title: "Preview destination record upserts",
      description:
        "Compare one analysis run with destination records and return a non-mutating, expiring diff.",
      inputSchema: z.object({ runId: z.string().uuid() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ runId }) => toolResult(await getService().previewUpsert(runId)),
  );

  server.registerTool(
    "approve_plan",
    {
      title: "Approve an exact change plan",
      description:
        "Record explicit approval bound to an exact plan digest and the signed-in account.",
      inputSchema: z.object({
        planId: z.string().uuid(),
        digest: z.string().min(1),
        confirmation: z.literal("I approve this exact plan"),
      }),
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ planId, digest, confirmation }) =>
      toolResult(await getService().approvePlan(planId, digest, confirmation)),
  );

  server.registerTool(
    "apply_schema",
    {
      title: "Apply an approved schema plan",
      description:
        "Create only the lists and columns in an unexpired schema plan approved by the same signed-in account.",
      inputSchema: z.object({ planId: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ planId }) => toolResult(await getService().applySchema(planId)),
  );

  server.registerTool(
    "apply_upsert",
    {
      title: "Apply an approved upsert plan",
      description:
        "Create or update destination records from an unexpired plan approved by the same signed-in account. Never deletes.",
      inputSchema: z.object({ planId: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ planId }) => toolResult(await getService().applyUpsert(planId)),
  );

  return server;
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}
