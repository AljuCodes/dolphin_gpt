"use client";

import { TOOL_MARKER } from "../lib/agent";

/**
 * Renders a fed-back command-output message (role "user", kind "tool") as a
 * terminal-style card instead of a normal chat bubble.
 */
export default function ToolMessage({ content }: { content: string }) {
  // Strip the sentinel line, then split off the "$ command" and exit-code lines.
  const body = content.startsWith(TOOL_MARKER)
    ? content.slice(TOOL_MARKER.length).replace(/^\r?\n/, "")
    : content;
  const lines = body.split("\n");
  const cmdLine = lines[0]?.startsWith("$ ") ? lines[0].slice(2) : "";
  const exitLine = lines.find((l) => l.startsWith("exit code:")) ?? "";
  const failed = /exit code:\s*(?!0\b)/.test(exitLine);
  const rest = lines
    .filter((l) => !l.startsWith("$ ") && !l.startsWith("exit code:"))
    .join("\n")
    .trim();

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[90%] rounded-xl border border-zinc-700 bg-zinc-950 overflow-hidden font-mono text-xs">
        <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/70 border-b border-zinc-700">
          <span className="text-emerald-400 truncate">$ {cmdLine}</span>
          <span
            className={`ml-3 shrink-0 rounded px-1.5 py-0.5 ${
              failed
                ? "bg-red-900/50 text-red-300"
                : "bg-emerald-900/40 text-emerald-300"
            }`}
          >
            {exitLine.replace("exit code:", "exit").trim() || "exit ?"}
          </span>
        </div>
        {rest && (
          <pre className="px-3 py-2 whitespace-pre-wrap break-words text-zinc-300 max-h-72 overflow-y-auto leading-relaxed">
            {rest}
          </pre>
        )}
      </div>
    </div>
  );
}
