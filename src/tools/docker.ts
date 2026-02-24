import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCommand, formatResult } from "../services/exec.js";

export function registerDockerTools(server: McpServer): void {
  server.registerTool(
    "vps_docker_list_containers",
    {
      title: "List Docker Containers",
      description: "List Docker containers on the VPS.",
      inputSchema: { all: z.boolean().default(false).describe("Include stopped containers") },
    },
    async ({ all }) => {
      const result = await runCommand(`docker ps ${all ? "-a" : ""} --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'`);
      return { content: [{ type: "text", text: result.stdout || "No containers" }] };
    }
  );

  server.registerTool(
    "vps_docker_container_logs",
    {
      title: "Get Container Logs",
      description: "Fetch logs from a Docker container.",
      inputSchema: {
        container: z.string().min(1).describe("Container name or ID"),
        tail: z.number().int().min(1).max(5000).default(100),
        since: z.string().optional().describe("e.g. '1h', '30m'"),
      },
    },
    async ({ container, tail, since }) => {
      const sinceFlag = since ? `--since ${since}` : "";
      const result = await runCommand(`docker logs --tail ${tail} ${sinceFlag} "${container}" 2>&1`);
      return { content: [{ type: "text", text: result.stdout || "(no logs)" }] };
    }
  );

  server.registerTool(
    "vps_docker_manage_container",
    {
      title: "Manage Docker Container",
      description: "Start, stop, restart, or remove a Docker container.",
      inputSchema: {
        action: z.enum(["start", "stop", "restart", "remove"]),
        container: z.string().min(1),
        force: z.boolean().default(false),
      },
    },
    async ({ action, container, force }) => {
      const cmd = action === "remove" ? `docker rm ${force ? "-f" : ""} "${container}"` : `docker ${action} "${container}"`;
      const result = await runCommand(cmd);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.registerTool(
    "vps_docker_run",
    {
      title: "Run Docker Container",
      description: "Pull and run a Docker container.",
      inputSchema: {
        image: z.string().min(1),
        name: z.string().min(1),
        ports: z.array(z.string()).optional(),
        env: z.array(z.string()).optional(),
        volumes: z.array(z.string()).optional(),
        detach: z.boolean().default(true),
        restart: z.string().default("unless-stopped"),
        extra_args: z.string().optional(),
      },
    },
    async ({ image, name, ports, env, volumes, detach, restart, extra_args }) => {
      const parts = ["docker run"];
      if (detach) parts.push("-d");
      parts.push(`--name "${name}"`, `--restart ${restart}`);
      if (ports) ports.forEach(p => parts.push(`-p ${p}`));
      if (env) env.forEach(e => parts.push(`-e "${e}"`));
      if (volumes) volumes.forEach(v => parts.push(`-v ${v}`));
      if (extra_args) parts.push(extra_args);
      parts.push(image);
      const result = await runCommand(parts.join(" "));
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.registerTool(
    "vps_docker_compose",
    {
      title: "Run Docker Compose",
      description: "Execute a docker compose command.",
      inputSchema: {
        action: z.enum(["up", "down", "restart", "pull", "ps", "logs"]),
        cwd: z.string().min(1).describe("Directory with docker-compose.yml"),
        service: z.string().optional(),
        detach: z.boolean().default(true),
        tail: z.number().int().default(100),
      },
    },
    async ({ action, cwd, service, detach, tail }) => {
      const svc = service ?? "";
      let cmd: string;
      if (action === "up") cmd = `docker compose up ${detach ? "-d" : ""} ${svc}`.trim();
      else if (action === "logs") cmd = `docker compose logs --tail ${tail} ${svc}`.trim();
      else cmd = `docker compose ${action} ${svc}`.trim();
      const result = await runCommand(cmd, cwd);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.registerTool(
    "vps_docker_images",
    {
      title: "List Docker Images",
      description: "List Docker images available on the VPS.",
      inputSchema: {},
    },
    async () => {
      const result = await runCommand("docker images");
      return { content: [{ type: "text", text: result.stdout || "No images" }] };
    }
  );
}
