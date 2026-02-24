import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runCommand } from "../services/exec.js";

export function registerDockerTools(server: McpServer): void {
  server.registerTool("vps_docker_list_containers", { title: "List Docker Containers", description: "List Docker containers", inputSchema: {} }, async () => { const r = await runCommand("docker ps"); return { content: [{ type: "text", text: r.stdout }] }; });
}
