"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  MemoryFact,
  addMemoryFact,
  clearAllMemory,
  deleteMemoryFact,
} from "../lib/api";

interface Props {
  facts: MemoryFact[];
  onRefresh: () => void;
  open: boolean;
  onClose: () => void;
}

export default function MemoryPanel({ facts, onRefresh, open, onClose }: Props) {
  const [input, setInput] = useState("");
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

  const handleAdd = async () => {
    if (!input.trim()) return;
    await addMemoryFact(input.trim());
    setInput("");
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await deleteMemoryFact(id);
    onRefresh();
  };

  const handleClear = async () => {
    await clearAllMemory();
    onRefresh();
  };

  if (!open) return null;

  const content = (
    <>
      {isMobile && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60"
          style={{ zIndex: 2147483646, pointerEvents: "auto" }}
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
                zIndex: 2147483647,
                pointerEvents: "auto",
              }
            : { width: "18rem", minWidth: "18rem", height: "100vh" }
        }
      >
      <div className="flex items-center gap-2">
        <span className="text-base">🧠</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Memory
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-md px-3 py-1.5 text-xs font-medium md:hidden"
          aria-label="Close memory panel"
          style={{ touchAction: "manipulation" }}
        >
          ✕ Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {facts.length === 0 ? (
          <p className="text-xs text-zinc-500 italic leading-relaxed">
            No memories yet. Facts are extracted automatically after each
            reply.
          </p>
        ) : (
          facts.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-2 bg-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
            >
              <span className="flex-1 leading-snug break-words">{f.fact}</span>
              <button
                onClick={() => handleDelete(f.id)}
                className="text-zinc-500 hover:text-red-400 transition-colors mt-0.5 shrink-0 text-xs"
                aria-label="delete memory"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-700 text-sm text-white rounded-lg px-3 py-2 outline-none placeholder-zinc-500 border border-zinc-600 focus:border-violet-500 transition-colors"
          placeholder="Add memory…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-3 py-2 text-sm font-bold transition-colors"
        >
          +
        </button>
      </div>

      {facts.length > 0 && (
        <button
          onClick={handleClear}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors text-left"
        >
          Clear all memories
        </button>
      )}
      </aside>
    </>
  );

  if (!mounted) return null;
  if (isMobile) return createPortal(content, document.body);
  return content;
}
