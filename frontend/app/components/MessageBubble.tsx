interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function MessageBubble({ role, content, isStreaming }: Props) {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold mt-1 select-none">
          D
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-violet-600 text-white rounded-br-sm"
            : "bg-zinc-700 text-zinc-100 rounded-bl-sm"
        }`}
      >
        {content}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-1 animate-pulse rounded-sm align-middle" />
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
