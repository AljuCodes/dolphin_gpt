"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MemoryPanel from "./components/MemoryPanel";
import ChatListPanel from "./components/ChatListPanel";
import MessageBubble from "./components/MessageBubble";
import ChatInput from "./components/ChatInput";
import {
  Message,
  MemoryFact,
  streamChat,
  getMemory,
  createChat,
  updateChat,
  getChat,
} from "./lib/api";

export default function Home() {
  const maxClientMessages = 12;
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [showMemory, setShowMemory] = useState(true);
  const [showChats, setShowChats] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatsRefreshKey, setChatsRefreshKey] = useState(0);
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const stored = localStorage.getItem("webSearch");
    if (stored === "1") setWebSearch(true);
    if (window.matchMedia("(max-width: 767px)").matches) setShowMemory(false);
  }, []);

  const toggleWebSearch = () => {
    setWebSearch((v) => {
      const next = !v;
      localStorage.setItem("webSearch", next ? "1" : "0");
      return next;
    });
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [pinned, setPinned] = useState(true);

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
    const el = scrollRef.current;
    if (!el) return;

    const atBottom = () =>
      el.scrollHeight - el.scrollTop - el.clientHeight < 24;

    const unpinIfUp = () => setPinned(false);

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) unpinIfUp();
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(e.key)) unpinIfUp();
    };
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y > touchStartY + 4) unpinIfUp();
    };
    const onScroll = () => {
      if (atBottom()) setPinned(true);
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("keydown", onKey);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (pinned) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pinned]);

  const jumpToBottom = () => {
    setPinned(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const runStream = async (baseMessages: Message[]) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const withPlaceholder: Message[] = [
      ...baseMessages,
      { role: "assistant", content: "" },
    ];
    setMessages(withPlaceholder);
    setStreaming(true);
    setPinned(true);

    try {
      let pending = "";
      let lastFlush = performance.now();

      const flush = () => {
        if (!pending) return;
        const text = pending;
        pending = "";
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            content: next[next.length - 1].content + text,
          };
          return next;
        });
      };

      for await (const chunk of streamChat(
        baseMessages,
        abortRef.current.signal,
        { webSearch }
      )) {
        pending += chunk;
        const now = performance.now();
        if (now - lastFlush >= 40) {
          flush();
          lastFlush = now;
        }
      }
      flush();
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
      try {
        const finalMessages = messagesRef.current;
        if (finalMessages.length) {
          if (activeChatIdRef.current) {
            await updateChat(activeChatIdRef.current, {
              messages: finalMessages,
            });
          } else {
            const created = await createChat(finalMessages);
            setActiveChatId(created.id);
          }
          setChatsRefreshKey((k) => k + 1);
        }
      } catch {
        /* persistence best-effort */
      }
    }
  };

  const sendMessage = async (content: string) => {
    if (streaming) return;
    const userMsg: Message = { role: "user", content };
    const base: Message[] = [...messages, userMsg].slice(-maxClientMessages);
    await runStream(base);
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const regenerateLast = async () => {
    if (streaming) return;
    // Drop the last assistant message (must be the most recent)
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const base = messages.slice(0, -1);
    if (base.length === 0 || base[base.length - 1].role !== "user") return;
    await runStream(base);
  };

  const editUserMessageAt = async (index: number, next: string) => {
    if (streaming) return;
    const base: Message[] = messages.slice(0, index + 1);
    if (!base[index] || base[index].role !== "user") return;
    base[index] = { role: "user", content: next };
    await runStream(base);
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setActiveChatId(null);
    setStreaming(false);
  };

  const selectChat = async (id: string) => {
    if (streaming) abortRef.current?.abort();
    try {
      const full = await getChat(id);
      setMessages(full.messages);
      setActiveChatId(full.id);
      setPinned(true);
      if (window.matchMedia("(max-width: 767px)").matches) setShowChats(false);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex h-[100dvh] bg-zinc-900 text-white overflow-hidden">
      <ChatListPanel
        open={showChats}
        onClose={() => setShowChats(false)}
        activeId={activeChatId}
        onSelect={selectChat}
        onNewChat={() => {
          clearChat();
          if (window.matchMedia("(max-width: 767px)").matches)
            setShowChats(false);
        }}
        refreshKey={chatsRefreshKey}
      />
      <MemoryPanel
        facts={facts}
        onRefresh={loadMemory}
        open={showMemory}
        onClose={() => setShowMemory(false)}
      />

      <div className="relative flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 bg-zinc-900 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChats((v) => !v)}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Toggle chat list"
            >
              💬
            </button>
            <button
              onClick={() => setShowMemory((v) => !v)}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Toggle memory panel"
            >
              🧠
            </button>
            <h1 className="font-semibold tracking-tight">dolphin_gpt</h1>
            <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5">
              gemma-4-E4B-uncensored
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleWebSearch}
              title={
                webSearch
                  ? "Internet lookup is ON — click to disable"
                  : "Internet lookup is OFF — click to enable"
              }
              className={`text-xs rounded px-2 py-1 border transition-colors ${
                webSearch
                  ? "bg-violet-600/20 border-violet-500 text-violet-200 hover:bg-violet-600/30"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🌐 {webSearch ? "Web: on" : "Web: off"}
            </button>
            <button
              onClick={clearChat}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              New chat
            </button>
          </div>
        </header>

        {/* Messages */}
        <main
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-4 py-6 pb-40 md:pb-6"
        >
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
                  gemma locally.
                </p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isLastAssistant =
                msg.role === "assistant" && i === messages.length - 1;
              const isLastUser =
                msg.role === "user" &&
                (i === messages.length - 1 ||
                  (i === messages.length - 2 &&
                    messages[messages.length - 1]?.role === "assistant"));
              return (
                <MessageBubble
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={streaming && isLastAssistant}
                  onRegenerate={
                    !streaming && isLastAssistant ? regenerateLast : undefined
                  }
                  onEdit={
                    !streaming && isLastUser
                      ? (next) => editUserMessageAt(i, next)
                      : undefined
                  }
                />
              );
            })}
            <div ref={bottomRef} />
          </div>
        </main>

        {!pinned && (
          <button
            onClick={jumpToBottom}
            className="absolute left-1/2 -translate-x-1/2 bottom-28 z-10 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded-full px-3 py-1.5 shadow-lg transition-colors"
          >
            ↓ Jump to latest
          </button>
        )}

        <ChatInput
          onSend={sendMessage}
          disabled={streaming}
          streaming={streaming}
          onStop={stopGeneration}
        />
      </div>
    </div>
  );
}
