"use client";

import { KeyboardEvent, useRef, useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const autoResize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-zinc-700 bg-zinc-900 p-4 shrink-0">
      <div className="flex items-end gap-3 max-w-4xl mx-auto bg-zinc-800 rounded-xl border border-zinc-600 focus-within:border-violet-500 transition-colors px-4 py-3">
        <textarea
          ref={ref}
          className="flex-1 bg-transparent text-white resize-none outline-none placeholder-zinc-500 text-sm leading-relaxed max-h-48"
          placeholder="Message dolphin_gpt… (Enter to send, Shift+Enter for newline)"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onInput={autoResize}
          disabled={disabled}
        />
        <button
          onClick={send}
          disabled={disabled || !value.trim()}
          className="shrink-0 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg p-2 transition-colors"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
      <p className="text-center text-xs text-zinc-600 mt-2">
        dolphin-mistral · local via Ollama
      </p>
    </div>
  );
}
