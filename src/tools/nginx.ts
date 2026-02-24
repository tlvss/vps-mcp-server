import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runCommand } from "../services/exec.js";

export function registerNginxTools(server: McpServer): void {
  server.registerTool("vps_nginx_status", { title: "Nginx Status", description: "Check Nginx status", inputSchema: {} }, async () => { const r = await runCommand("systemctl is-active nginx"); return { content: [{ type: "text", text: r.stdout }] }; });
}
