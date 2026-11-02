"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MemoryPanel from "./components/MemoryPanel";
import ChatListPanel from "./components/ChatListPanel";
import MessageBubble from "./components/MessageBubble";
import ToolMessage from "./components/ToolMessage";
import ChatInput from "./components/ChatInput";
import {
  Message,
  MemoryFact,
  ExecResult,
  streamChat,
  execCommand,
  getMemory,
  createChat,
  updateChat,
  getChat,
} from "./lib/api";
import {
  extractRunCommand,
  formatToolResult,
  MAX_AGENT_STEPS,
} from "./lib/agent";

export default function Home() {
  const maxClientMessages = 12;
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [showMemory, setShowMemory] = useState(true);
  const [showChats, setShowChats] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<{ command: string } | null>(
    null
  );
  const agentModeRef = useRef(false);
  const autoRunRef = useRef(false);
  const agentCancelledRef = useRef(false);
  const execAbortRef = useRef<AbortController | null>(null);
  const approvalResolverRef = useRef<((v: boolean) => void) | null>(null);
  useEffect(() => {
    agentModeRef.current = agentMode;
  }, [agentMode]);
  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);
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
    if (localStorage.getItem("agentMode") === "1") setAgentMode(true);
    if (localStorage.getItem("autoRun") === "1") setAutoRun(true);
    if (window.matchMedia("(max-width: 767px)").matches) setShowMemory(false);
  }, []);

  const toggleWebSearch = () => {
    setWebSearch((v) => {
      const next = !v;
      localStorage.setItem("webSearch", next ? "1" : "0");
      return next;
    });
  };

  const toggleAgentMode = () => {
    setAgentMode((v) => {
      const next = !v;
      localStorage.setItem("agentMode", next ? "1" : "0");
      if (!next) {
        setAutoRun(false);
        localStorage.setItem("autoRun", "0");
      }
      return next;
    });
  };

  const toggleAutoRun = () => {
    setAutoRun((v) => {
      const next = !v;
      if (
        next &&
        !window.confirm(
          "Auto-run will execute every command the model proposes WITHOUT asking " +
            "you first. A local model can generate destructive commands. Enable anyway?"
        )
      ) {
        return v;
      }
      localStorage.setItem("autoRun", next ? "1" : "0");
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

  const runStream = async (baseMessages: Message[]): Promise<string> => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const withPlaceholder: Message[] = [
      ...baseMessages,
      { role: "assistant", content: "" },
    ];
    setMessages(withPlaceholder);
    setStreaming(true);
    setPinned(true);

    let assembled = "";
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
        { webSearch, agentMode: agentModeRef.current }
      )) {
        assembled += chunk;
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
    return assembled;
  };

  // --- Agent mode: command approval + execution loop -----------------------

  const requestApproval = (command: string): Promise<boolean> =>
    new Promise((resolve) => {
      approvalResolverRef.current = resolve;
      setPendingCommand({ command });
    });

  const resolveApproval = (approved: boolean) => {
    setPendingCommand(null);
    const resolve = approvalResolverRef.current;
    approvalResolverRef.current = null;
    resolve?.(approved);
  };

  const runCommand = async (command: string): Promise<ExecResult | null> => {
    setExecuting(true);
    execAbortRef.current = new AbortController();
    try {
      return await execCommand(command, execAbortRef.current.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") return null;
      return {
        stdout: "",
        stderr: "Could not reach the exec endpoint. Is the backend running?",
        exit_code: -1,
        timed_out: false,
        truncated: false,
        duration_ms: 0,
      };
    } finally {
      setExecuting(false);
    }
  };

  const runAgentTurn = async (initialBase: Message[]) => {
    let convo = initialBase;
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const finalText = await runStream(convo);
      convo = [...convo, { role: "assistant", content: finalText }];
      if (!agentModeRef.current || agentCancelledRef.current) return;

      const command = extractRunCommand(finalText);
      if (!command) return;

      const approved = autoRunRef.current
        ? true
        : await requestApproval(command);
      if (!approved || agentCancelledRef.current) return;

      const result = await runCommand(command);
      if (result === null || agentCancelledRef.current) return;

      const toolMsg: Message = {
        role: "user",
        kind: "tool",
        content: formatToolResult(command, result),
      };
      convo = [...convo, toolMsg].slice(-maxClientMessages);
      setMessages(convo);
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `⚠ Reached the ${MAX_AGENT_STEPS}-command limit for this turn. Send another message to keep going.`,
      },
    ]);
  };

  const run = async (base: Message[]) => {
    agentCancelledRef.current = false;
    if (agentModeRef.current) {
      await runAgentTurn(base);
    } else {
      await runStream(base);
    }
  };

  const busy = streaming || executing || pendingCommand !== null;

  const sendMessage = async (content: string) => {
    if (busy) return;
    const userMsg: Message = { role: "user", content };
    const base: Message[] = [...messages, userMsg].slice(-maxClientMessages);
    await run(base);
  };

  const stopGeneration = () => {
    agentCancelledRef.current = true;
    abortRef.current?.abort();
    execAbortRef.current?.abort();
    resolveApproval(false);
    setStreaming(false);
    setExecuting(false);
  };

  const regenerateLast = async () => {
    if (busy) return;
    // Drop the last assistant message (must be the most recent)
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const base = messages.slice(0, -1);
    if (base.length === 0 || base[base.length - 1].role !== "user") return;
    await run(base);
  };

  const editUserMessageAt = async (index: number, next: string) => {
    if (busy) return;
    const base: Message[] = messages.slice(0, index + 1);
    if (!base[index] || base[index].role !== "user") return;
    base[index] = { role: "user", content: next };
    await run(base);
  };

  const clearChat = () => {
    agentCancelledRef.current = true;
    abortRef.current?.abort();
    execAbortRef.current?.abort();
    resolveApproval(false);
    setMessages([]);
    setActiveChatId(null);
    setStreaming(false);
    setExecuting(false);
  };

  const selectChat = async (id: string) => {
    if (busy) {
      agentCancelledRef.current = true;
      abortRef.current?.abort();
      execAbortRef.current?.abort();
      resolveApproval(false);
    }
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
              onClick={toggleAgentMode}
              title={
                agentMode
                  ? "Command execution is ON — the model can run shell commands (you approve each one)"
                  : "Command execution is OFF — click to let the model run shell commands"
              }
              className={`text-xs rounded px-2 py-1 border transition-colors ${
                agentMode
                  ? "bg-emerald-600/20 border-emerald-500 text-emerald-200 hover:bg-emerald-600/30"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🖥 {agentMode ? "Run: on" : "Run: off"}
            </button>
            {agentMode && (
              <button
                onClick={toggleAutoRun}
                title={
                  autoRun
                    ? "Auto-run is ON — commands execute without asking. Click to require approval."
                    : "Auto-run is OFF — you approve each command. Click to run automatically."
                }
                className={`text-xs rounded px-2 py-1 border transition-colors ${
                  autoRun
                    ? "bg-amber-600/20 border-amber-500 text-amber-200 hover:bg-amber-600/30"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ⚡ {autoRun ? "Auto-run" : "Approve"}
              </button>
            )}
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
              if (msg.kind === "tool") {
                return <ToolMessage key={i} content={msg.content} />;
              }
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
                    !busy && isLastAssistant ? regenerateLast : undefined
                  }
                  onEdit={
                    !busy && isLastUser
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

        {(pendingCommand || executing) && (
          <div className="px-4 pb-2 md:pb-0">
            <div className="max-w-4xl mx-auto">
              {pendingCommand && (
                <div className="rounded-xl border border-emerald-600/50 bg-zinc-800 p-3 mb-2">
                  <div className="text-xs text-zinc-400 mb-1.5">
                    The model wants to run this command:
                  </div>
                  <pre className="font-mono text-sm text-emerald-300 bg-zinc-950 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words">
                    {pendingCommand.command}
                  </pre>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => resolveApproval(true)}
                      className="text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md px-3 py-1.5 transition-colors"
                    >
                      ▶ Run
                    </button>
                    <button
                      onClick={() => resolveApproval(false)}
                      className="text-xs text-zinc-300 hover:text-white bg-zinc-700 hover:bg-zinc-600 rounded-md px-3 py-1.5 transition-colors"
                    >
                      Skip
                    </button>
                    <span className="text-xs text-zinc-500 ml-auto">
                      runs on your machine
                    </span>
                  </div>
                </div>
              )}
              {executing && (
                <div className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 mb-2 flex items-center gap-2 text-xs text-zinc-300">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Running command…
                  <button
                    onClick={stopGeneration}
                    className="ml-auto text-zinc-400 hover:text-white"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <ChatInput
          onSend={sendMessage}
          disabled={busy}
          streaming={streaming || executing}
          onStop={stopGeneration}
        />
      </div>
    </div>
  );
}
