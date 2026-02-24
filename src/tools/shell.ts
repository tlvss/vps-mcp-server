import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCommand, formatResult } from "../services/exec.js";

export function registerShellTools(server: McpServer): void {
  server.registerTool("vps_run_command", { title: "Run Shell Command", description: "Execute an arbitrary shell command on the VPS", inputSchema: { command: z.string().min(1), cwd: z.string().optional() } }, async ({ command, cwd }) => { const result = await runCommand(command, cwd ?? "/root"); return { content: [{ type: "text", text: formatResult(result) }] }; });
}
