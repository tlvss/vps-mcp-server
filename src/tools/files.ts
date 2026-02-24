import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { runCommand } from "../services/exec.js";

function safePath(p: string): string {
  const resolved = path.resolve(p);
  const blocked = ["/etc/shadow", "/etc/gshadow", "/root/.ssh/id_"];
  for (const b of blocked) {
    if (resolved.startsWith(b)) throw new Error(`Access to ${b}* is blocked`);
  }
  return resolved;
}

export function registerFileTools(server: McpServer): void {
  server.registerTool(
    "vps_read_file",
    {
      title: "Read File",
      description: "Read the contents of a file on the VPS.",
      inputSchema: {
        path: z.string().min(1).describe("Absolute path to the file"),
        max_lines: z.number().int().min(1).max(5000).default(500).describe("Max lines to return"),
      },
    },
    async ({ path: filePath, max_lines }) => {
      const safe = safePath(filePath);
      const result = await runCommand(`head -n ${max_lines} "${safe}"`);
      if (!result.success) {
        return { isError: true, content: [{ type: "text", text: `Error: ${result.stderr}` }] };
      }
      return { content: [{ type: "text", text: result.stdout || "(empty file)" }] };
    }
  );

  server.registerTool(
    "vps_write_file",
    {
      title: "Write File",
      description: "Write content to a file on the VPS. Auto-backups existing file.",
      inputSchema: {
        path: z.string().min(1).describe("Absolute path to write"),
        content: z.string().describe("Content to write to the file"),
        create_dirs: z.boolean().default(true).describe("Create parent directories if missing"),
      },
    },
    async ({ path: filePath, content, create_dirs }) => {
      const safe = safePath(filePath);
      try {
        if (create_dirs) await fs.mkdir(path.dirname(safe), { recursive: true });
        try { await fs.copyFile(safe, `${safe}.bak`); } catch { /* no existing file */ }
        await fs.writeFile(safe, content, "utf8");
        const bytes = Buffer.byteLength(content, "utf8");
        return { content: [{ type: "text", text: `Written ${bytes} bytes to ${safe}` }] };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: `Error: ${msg}` }] };
      }
    }
  );

  server.registerTool(
    "vps_list_directory",
    {
      title: "List Directory",
      description: "List contents of a directory on the VPS.",
      inputSchema: {
        path: z.string().default("/root").describe("Directory path"),
        show_hidden: z.boolean().default(false).describe("Include hidden files"),
      },
    },
    async ({ path: dirPath, show_hidden }) => {
      const safe = safePath(dirPath);
      const flag = show_hidden ? "-la" : "-l";
      const result = await runCommand(`ls ${flag} --time-style=long-iso "${safe}" 2>&1`);
      return { content: [{ type: "text", text: result.stdout }] };
    }
  );

  server.registerTool(
    "vps_delete_file",
    {
      title: "Delete File or Directory",
      description: "Delete a file or directory on the VPS. Auto-backups files before deletion.",
      inputSchema: {
        path: z.string().min(1).describe("Absolute path to delete"),
        recursive: z.boolean().default(false).describe("Delete directories recursively"),
      },
    },
    async ({ path: filePath, recursive }) => {
      const safe = safePath(filePath);
      const flag = recursive ? "-rf" : "-f";
      try {
        const stat = await fs.stat(safe);
        if (stat.isFile()) await fs.copyFile(safe, `${safe}.bak`);
      } catch { /* already gone or dir */ }
      const result = await runCommand(`rm ${flag} "${safe}"`);
      if (!result.success) {
        return { isError: true, content: [{ type: "text", text: `Error: ${result.stderr}` }] };
      }
      return { content: [{ type: "text", text: `Deleted: ${safe}` }] };
    }
  );
}
