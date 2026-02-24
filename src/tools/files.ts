import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runCommand } from "../services/exec.js";

export function registerFileTools(server: McpServer): void {
  server.registerTool("vps_read_file", { title: "Read File", description: "Read a file on the VPS", inputSchema: { path: { type: "string" } } }, async ({ path }) => { const r = await runCommand(`cat "${path}"`); return { content: [{ type: "text", text: r.stdout }] }; });
}
