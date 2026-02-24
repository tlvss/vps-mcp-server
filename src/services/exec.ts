import { exec } from "child_process";
import { promisify } from "util";

export const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
  success: boolean;
  exitCode?: number;
}

export async function runCommand(
  command: string,
  cwd?: string
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: err.stdout?.trim() ?? "",
      stderr: err.stderr?.trim() ?? err.message ?? "Unknown error",
      success: false,
      exitCode: err.code,
    };
  }
}

export function formatResult(result: ExecResult): string {
  const parts: string[] = [];
  if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
  if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
  if (!result.success) parts.push(`exit_code: ${result.exitCode ?? 1}`);
  return parts.join("\n\n") || "(no output)";
}
