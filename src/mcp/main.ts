import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createMcpServer } from "./server.js";

const server = createMcpServer();
const transport = new StdioServerTransport();

process.on("SIGINT", () => {
  void server.close().finally(() => process.exit(0));
});

await server.connect(transport);
console.error("ui-evidence MCP server is listening on stdio");
