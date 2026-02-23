import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerShellTools } from "./tools/shell.js";
import { registerFileTools } from "./tools/files.js";
import { registerDockerTools } from "./tools/docker.js";
import { registerNginxTools } from "./tools/nginx.js";

const server = new McpServer({
  name: "vps-mcp-server",
  version: "1.0.0",
});

registerShellTools(server);
registerFileTools(server);
registerDockerTools(server);
registerNginxTools(server);

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const token = process.env.MCP_AUTH_TOKEN;
    if (!token) return next();
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${token}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "vps-mcp-server", version: "1.0.0" });
  });

  const port = parseInt(process.env.PORT ?? "3841");
  const host = process.env.HOST ?? "127.0.0.1";
  app.listen(port, host, () => {
    console.error(`vps-mcp-server listening on http://${host}:${port}/mcp`);
    console.error(`Health: http://${host}:${port}/health`);
    if (!process.env.MCP_AUTH_TOKEN) {
      console.error("WARNING: MCP_AUTH_TOKEN not set");
    }
  });
}

runHTTP().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});