import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runCommand, formatResult } from "../services/exec.js";
import { promises as fs } from "fs";

const NGINX_SITES_AVAILABLE = "/etc/nginx/sites-available";
const NGINX_SITES_ENABLED = "/etc/nginx/sites-enabled";

export function registerNginxTools(server: McpServer): void {
  server.registerTool(
    "vps_nginx_status",
    {
      title: "Nginx Status",
      description: "Check Nginx status, sites, and config validity.",
      inputSchema: {},
    },
    async () => {
      const [status, test, sites] = await Promise.all([
        runCommand("systemctl is-active nginx"),
        runCommand("nginx -t 2>&1"),
        runCommand(`ls ${NGINX_SITES_ENABLED}/`),
      ]);
      const info = {
        running: status.stdout === "active",
        config_valid: test.stderr.includes("test is successful"),
        enabled_sites: sites.stdout.split("\n").filter(Boolean),
      };
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    }
  );

  server.registerTool(
    "vps_nginx_create_site",
    {
      title: "Create Nginx Site",
      description: "Create a new Nginx virtual host and enable it.",
      inputSchema: {
        domain: z.string().min(1),
        upstream_port: z.number().int().min(1).max(65535),
        ssl: z.boolean().default(false),
        enable: z.boolean().default(true),
        custom_config: z.string().optional(),
      },
    },
    async ({ domain, upstream_port, ssl, enable, custom_config }) => {
      const configName = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
      const configPath = `${NGINX_SITES_AVAILABLE}/${configName}`;
      const enablePath = `${NGINX_SITES_ENABLED}/${configName}`;
      const config = custom_config ?? `server {
    listen 80;
    server_name ${domain};
    location / {
        proxy_pass http://127.0.0.1:${upstream_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}\n`;
      try {
        await fs.writeFile(configPath, config, "utf8");
        if (enable) {
          await runCommand(`ln -sf "${configPath}" "${enablePath}"`);
          const test = await runCommand("nginx -t 2>&1");
          if (!test.stderr.includes("test is successful")) {
            await fs.unlink(enablePath).catch(() => {});
            await fs.unlink(configPath).catch(() => {});
            return { isError: true, content: [{ type: "text", text: `Config test failed:\n${test.stderr}` }] };
          }
          await runCommand("systemctl reload nginx");
        }
        if (ssl) {
          await runCommand(`certbot --nginx -d ${domain} --non-interactive --agree-tos --email admin@${domain} 2>&1`);
        }
        return { content: [{ type: "text", text: `Site created: ${configPath}${enable ? " (enabled)" : ""}${ssl ? " + SSL" : ""}` }] };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: `Error: ${msg}` }] };
      }
    }
  );

  server.registerTool(
    "vps_nginx_toggle_site",
    {
      title: "Enable or Disable Nginx Site",
      description: "Enable or disable an Nginx virtual host.",
      inputSchema: {
        site: z.string().min(1),
        action: z.enum(["enable", "disable"]),
      },
    },
    async ({ site, action }) => {
      const availPath = `${NGINX_SITES_AVAILABLE}/${site}`;
      const enablePath = `${NGINX_SITES_ENABLED}/${site}`;
      const result = action === "enable"
        ? await runCommand(`ln -sf "${availPath}" "${enablePath}"`)
        : await runCommand(`rm -f "${enablePath}"`);
      if (!result.success) return { isError: true, content: [{ type: "text", text: result.stderr }] };
      await runCommand("systemctl reload nginx");
      return { content: [{ type: "text", text: `Site ${site} ${action}d.` }] };
    }
  );

  server.registerTool(
    "vps_nginx_reload",
    {
      title: "Reload / Restart Nginx",
      description: "Reload Nginx config or do a full restart.",
      inputSchema: { action: z.enum(["reload", "restart"]).default("reload") },
    },
    async ({ action }) => {
      const test = await runCommand("nginx -t 2>&1");
      if (!test.stderr.includes("test is successful")) {
        return { isError: true, content: [{ type: "text", text: `Config test failed:\n${test.stderr}` }] };
      }
      const result = await runCommand(`systemctl ${action} nginx`);
      return { content: [{ type: "text", text: formatResult(result) }] };
    }
  );

  server.registerTool(
    "vps_nginx_list_sites",
    {
      title: "List Nginx Sites",
      description: "List available and enabled Nginx sites.",
      inputSchema: {},
    },
    async () => {
      const [available, enabled] = await Promise.all([
        runCommand(`ls ${NGINX_SITES_AVAILABLE}/`),
        runCommand(`ls ${NGINX_SITES_ENABLED}/`),
      ]);
      const info = {
        available: available.stdout.split("\n").filter(Boolean),
        enabled: enabled.stdout.split("\n").filter(Boolean),
      };
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    }
  );
}
