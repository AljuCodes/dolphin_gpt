"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChatSummary, deleteChat, listChats } from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  refreshKey: number;
}

export default function ChatListPanel({
  open,
  onClose,
  activeId,
  onSelect,
  onNewChat,
  refreshKey,
}: Props) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    listChats()
      .then(setChats)
      .catch(() => setChats([]));
  }, [open, refreshKey]);

  if (!open || !mounted) return null;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this chat?")) return;
    await deleteChat(id);
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNewChat();
  };

  const content = (
    <>
      {isMobile && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60"
          style={{ zIndex: 2147483644, pointerEvents: "auto" }}
          aria-hidden
        />
      )}
      <aside
        className="bg-zinc-800 border-r border-zinc-700 p-4 flex flex-col gap-3"
        style={
          isMobile
            ? {
                position: "fixed",
                top: 0,
                bottom: 0,
                left: 0,
                width: "18rem",
                zIndex: 2147483645,
                pointerEvents: "auto",
              }
            : { width: "18rem", minWidth: "18rem", height: "100vh" }
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-base">💬</span>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Chats
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-md px-3 py-1.5 text-xs font-medium md:hidden"
            style={{ touchAction: "manipulation" }}
          >
            ✕ Close
          </button>
        </div>

        <button
          onClick={onNewChat}
          className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          + New chat
        </button>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1">
          {chats.length === 0 ? (
            <p className="text-xs text-zinc-500 italic leading-relaxed">
              No chats yet. Send a message to start one.
            </p>
          ) : (
            chats.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                  activeId === c.id
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-300 hover:bg-zinc-700/60"
                }`}
                onClick={() => onSelect(c.id)}
              >
                <span className="flex-1 truncate leading-snug">{c.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(c.id);
                  }}
                  className="text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 text-xs"
                  aria-label="delete chat"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );

  if (isMobile) return createPortal(content, document.body);
  return content;
}
