import { ExecResult } from "./api";

// Sentinel that prefixes tool-output messages fed back to the model.
export const TOOL_MARKER = "⟦command-output⟧";

// Max agent steps (command + follow-up) per user turn, to avoid runaways.
export const MAX_AGENT_STEPS = 20;

/**
 * Extract the first ```run fenced command from an assistant message.
 * Returns the trimmed command, or null if there is no run block.
 */
export function extractRunCommand(content: string): string | null {
  // ```run ... ``` — language tag must be exactly `run` (case-insensitive).
  const re = /```[ \t]*run[ \t]*\r?\n([\s\S]*?)```/i;
  const m = re.exec(content);
  if (!m) return null;
  const cmd = m[1].replace(/\s+$/, "").replace(/^\s*\r?\n/, "").trim();
  return cmd || null;
}

/** Format a command result as the text fed back to the model. */
export function formatToolResult(command: string, r: ExecResult): string {
  const lines: string[] = [TOOL_MARKER, `$ ${command}`];
  lines.push(
    `exit code: ${r.exit_code}${r.timed_out ? " (timed out)" : ""}` +
      (r.truncated ? " (output truncated)" : "")
  );
  if (r.stdout) lines.push("stdout:\n" + r.stdout);
  if (r.stderr) lines.push("stderr:\n" + r.stderr);
  if (!r.stdout && !r.stderr) lines.push("(no output)");
  return lines.join("\n");
}
