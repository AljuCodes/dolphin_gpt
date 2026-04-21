"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (next: string) => void;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked; silently ignore */
        }
      }}
      className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700 rounded px-2 py-0.5 transition-colors"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock(props: React.HTMLAttributes<HTMLPreElement>) {
  const { children, ...rest } = props;
  const codeText =
    typeof children === "object" && children !== null && "props" in children
      ? String(
          (children as { props: { children?: unknown } }).props.children ?? ""
        )
      : "";
  return (
    <div className="relative group my-2">
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={codeText} />
      </div>
      <pre {...rest}>{children}</pre>
    </div>
  );
}

export default function MessageBubble({
  role,
  content,
  isStreaming,
  onRegenerate,
  onEdit,
}: Props) {
  const isUser = role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  return (
    <div
      className={`group/msg flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold mt-1 select-none">
          D
        </div>
      )}

      <div
        className={`flex flex-col gap-1 max-w-[75%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        {editing && isUser ? (
          <div className="w-full flex flex-col gap-2 bg-zinc-800 rounded-2xl p-3 border border-zinc-600">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="bg-transparent text-white outline-none resize-none text-sm leading-relaxed min-h-[3rem]"
              rows={Math.min(10, draft.split("\n").length + 1)}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setDraft(content);
                  setEditing(false);
                }}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const trimmed = draft.trim();
                  if (!trimmed) return;
                  setEditing(false);
                  onEdit?.(trimmed);
                }}
                className="text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-md px-3 py-1"
              >
                Save & rerun
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
              isUser
                ? "bg-violet-600 text-white rounded-br-sm whitespace-pre-wrap"
                : "bg-zinc-700 text-zinc-100 rounded-bl-sm markdown-body"
            }`}
          >
            {isUser ? (
              content
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
                components={{ pre: CodeBlock }}
              >
                {content}
              </ReactMarkdown>
            )}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-1 animate-pulse rounded-sm align-middle" />
            )}
          </div>
        )}

        {!editing && !isStreaming && content && (
          <div className="flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
            {!isUser && <CopyButton text={content} />}
            {!isUser && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700 rounded px-2 py-0.5 transition-colors"
                title="Regenerate response"
              >
                ↻ Regenerate
              </button>
            )}
            {isUser && onEdit && (
              <button
                onClick={() => {
                  setDraft(content);
                  setEditing(true);
                }}
                className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700 rounded px-2 py-0.5 transition-colors"
                title="Edit and rerun"
              >
                ✎ Edit
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-600 flex items-center justify-center text-white text-xs font-bold mt-1 select-none">
          U
        </div>
      )}
    </div>
  );
}
