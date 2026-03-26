"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MemoryPanel from "./components/MemoryPanel";
import MessageBubble from "./components/MessageBubble";
import ChatInput from "./components/ChatInput";
import { Message, MemoryFact, streamChat, getMemory } from "./lib/api";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [showMemory, setShowMemory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMemory = useCallback(async () => {
    try {
      setFacts(await getMemory());
    } catch {
      // backend may not be running yet
    }
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (streaming) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      for await (const chunk of streamChat(newMessages, abortRef.current.signal)) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: next[next.length - 1].content + chunk,
          };
          return next;
        });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          if (!next[next.length - 1].content) {
            next[next.length - 1] = {
              ...next[next.length - 1],
              content: "⚠ Could not reach backend. Is it running?",
            };
          }
          return next;
        });
      }
    } finally {
      setStreaming(false);
      loadMemory();
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  };

  return (
    <div className="flex h-screen bg-zinc-900 text-white overflow-hidden">
      {showMemory && (
        <MemoryPanel facts={facts} onRefresh={loadMemory} />
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 bg-zinc-900 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMemory((v) => !v)}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Toggle memory panel"
            >
              🧠
            </button>
            <h1 className="font-semibold tracking-tight">dolphin_gpt</h1>
            <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5">
              dolphin-mistral
            </span>
          </div>
          <button
            onClick={clearChat}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            New chat
          </button>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            {messages.length === 0 && (
              <div className="text-center mt-24 select-none">
                <div className="text-6xl mb-4">🐬</div>
                <h2 className="text-2xl font-semibold text-zinc-300 mb-2">
                  dolphin_gpt
                </h2>
                <p className="text-zinc-500 max-w-sm mx-auto text-sm leading-relaxed">
                  Uncensored chat with full context awareness. Stories,
                  creative writing, anything you need — powered by
                  dolphin-mistral locally.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                role={msg.role}
                content={msg.content}
                isStreaming={
                  streaming &&
                  i === messages.length - 1 &&
                  msg.role === "assistant"
                }
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </main>

        <ChatInput onSend={sendMessage} disabled={streaming} />
      </div>
    </div>
  );
}
