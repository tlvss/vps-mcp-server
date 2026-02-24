import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCommand, formatResult } from "../services/exec.js";

export function registerShellTools(server: McpServer): void {
  server.registerTool(
    "vps_run_command",
    {
      title: "Run Shell Command",
      description: "Execute an arbitrary shell command on the VPS and return stdout/stderr.",
      inputSchema: {
        command: z.string().min(1).describe("Shell command to execute"),
        cwd: z.string().optional().describe("Working directory"),
      },
    },
    async ({ command, cwd }) => {
      const result = await runCommand(command, cwd ?? "/root");
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.registerTool(
    "vps_get_system_info",
    {
      title: "Get System Info",
      description: "Return a snapshot of VPS system health: CPU, RAM, disk, uptime.",
      inputSchema: {},
    },
    async () => {
      const [os, mem, disk, uptime, load] = await Promise.all([
        runCommand("lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'"),
        runCommand("free -m | awk 'NR==2{printf \"{\\\"total\\\":%s,\\\"used\\\":%s,\\\"free\\\":%s}\", $2,$3,$4}'"),
        runCommand("df -h / | awk 'NR==2{printf \"{\\\"total\\\":\\\"%s\\\",\\\"used\\\":\\\"%s\\\",\\\"free\\\":\\\"%s\\\"}\", $2,$3,$4}'"),
        runCommand("uptime -p"),
        runCommand("cat /proc/loadavg"),
      ]);
      const info = {
        os: os.stdout, uptime: uptime.stdout,
        load_avg: load.stdout.split(" ").slice(0, 3).join(", "),
        memory_mb: JSON.parse(mem.stdout || "{}"),
        disk_root: JSON.parse(disk.stdout || "{}"),
      };
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    }
  );

  server.registerTool(
    "vps_list_processes",
    {
      title: "List Running Processes",
      description: "List top running processes by CPU or memory usage.",
      inputSchema: {
        sort_by: z.enum(["cpu", "mem"]).default("cpu"),
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ sort_by, limit }) => {
      const flag = sort_by === "mem" ? "--sort=-%mem" : "--sort=-%cpu";
      const result = await runCommand(`ps aux ${flag} | head -n ${limit + 1}`);
      return { content: [{ type: "text", text: result.stdout }] };
    }
  );
}
