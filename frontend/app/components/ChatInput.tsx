"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { extractFile } from "../lib/extract";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  streaming?: boolean;
  onStop?: () => void;
}

type Attachment = { name: string; text: string };

type SRConstructor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function ChatInput({ onSend, disabled, streaming, onStop }: Props) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [srSupported, setSrSupported] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<InstanceType<SRConstructor> | null>(null);
  const baseValueRef = useRef("");

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor;
      webkitSpeechRecognition?: SRConstructor;
    };
    setSrSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const send = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    let payload = trimmed;
    if (attachments.length) {
      const pre = attachments
        .map(
          (a) =>
            `--- Attached file: ${a.name} ---\n${a.text}\n--- End of ${a.name} ---`
        )
        .join("\n\n");
      payload = payload ? `${pre}\n\n${payload}` : pre;
    }
    onSend(payload);
    setValue("");
    setAttachments([]);
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

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setExtracting(true);
    try {
      const out: Attachment[] = [];
      for (const f of Array.from(files)) {
        try {
          const text = await extractFile(f);
          out.push({ name: f.name, text });
        } catch {
          out.push({ name: f.name, text: "[could not extract content]" });
        }
      }
      setAttachments((prev) => [...prev, ...out]);
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggleRecording = () => {
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor;
      webkitSpeechRecognition?: SRConstructor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    baseValueRef.current = value ? value.trimEnd() + " " : "";
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setValue(baseValueRef.current + transcript);
      autoResize();
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  };

  return (
    <div
      className="
        fixed bottom-0 left-0 right-0 z-20
        border-t border-zinc-700 bg-zinc-900 p-4 shrink-0
        md:static md:z-auto
      "
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-md px-2 py-1"
              >
                📎 {a.name}
                <button
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-zinc-400 hover:text-red-400"
                  aria-label="remove attachment"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 bg-zinc-800 rounded-xl border border-zinc-600 focus-within:border-violet-500 transition-colors px-3 py-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled || extracting}
            className="shrink-0 text-zinc-400 hover:text-zinc-100 disabled:opacity-40 rounded-lg p-2 transition-colors"
            aria-label="Attach file"
            title="Attach file (text / PDF)"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept=".txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.htm,.css,.scss,.js,.jsx,.ts,.tsx,.py,.rb,.rs,.go,.java,.kt,.c,.cc,.cpp,.h,.hpp,.sh,.bash,.zsh,.sql,.toml,.ini,.env,.log,.tex,.vue,.svelte,.pdf,application/pdf,text/*"
            onChange={(e) => onFiles(e.target.files)}
          />
          {srSupported && (
            <button
              onClick={toggleRecording}
              disabled={disabled}
              className={`shrink-0 rounded-lg p-2 transition-colors ${
                recording
                  ? "bg-red-600 text-white animate-pulse"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
              aria-label={recording ? "Stop recording" : "Start voice input"}
              title={recording ? "Stop recording" : "Voice input"}
            >
              🎙
            </button>
          )}
          <textarea
            ref={ref}
            className="flex-1 bg-transparent text-white resize-none outline-none placeholder-zinc-500 text-sm leading-relaxed max-h-48 py-1"
            placeholder={
              extracting
                ? "Extracting file…"
                : recording
                ? "Listening…"
                : "Message dolphin_gpt… (Enter to send, Shift+Enter for newline)"
            }
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            onInput={autoResize}
            disabled={disabled}
          />
          {streaming && onStop ? (
            <button
              onClick={onStop}
              className="shrink-0 bg-red-600 hover:bg-red-500 text-white rounded-lg p-2 transition-colors"
              aria-label="Stop generation"
              title="Stop generating"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={send}
              disabled={disabled || (!value.trim() && attachments.length === 0)}
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
          )}
        </div>
      </div>
      <p className="text-center text-xs text-zinc-600 mt-2">
        gemma · local via Ollama
      </p>
    </div>
  );
}
