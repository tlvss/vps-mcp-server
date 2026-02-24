import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerShellTools } from "./tools/shell.js";
import { registerFileTools } from "./tools/files.js";
import { registerDockerTools } from "./tools/docker.js";
import { registerNginxTools } from "./tools/nginx.js";

// ── Server Initialization ────────────────────────────────────────────────────
const server = new McpServer({
  name: "vps-mcp-server",
  version: "1.0.0",
});

// ── Register All Tool Groups ─────────────────────────────────────────────────
registerShellTools(server);
registerFileTools(server);
registerDockerTools(server);
registerNginxTools(server);

// ── HTTP Transport (Remote Access) ───────────────────────────────────────────
async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Auth middleware — validates Bearer token from MCP_AUTH_TOKEN env var
  app.use((req, res, next) => {
    const token = process.env.MCP_AUTH_TOKEN;
    if (!token) return next(); // No token set → open (dev mode)
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

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "vps-mcp-server", version: "1.0.0" });
  });

  const port = parseInt(process.env.PORT ?? "3841");
  const host = process.env.HOST ?? "127.0.0.1";
  app.listen(port, host, () => {
    console.error(`vps-mcp-server listening on http://${host}:${port}/mcp`);
    console.error(`Health: http://${host}:${port}/health`);
    if (!process.env.MCP_AUTH_TOKEN) {
      console.error("⚠️  WARNING: MCP_AUTH_TOKEN not set — server is unauthenticated");
    }
  });
}

runHTTP().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
