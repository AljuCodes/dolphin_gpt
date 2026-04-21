export type Message = { role: "user" | "assistant"; content: string };
export type MemoryFact = { id: string; fact: string };
export type ChatSummary = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
};
export type ChatFull = ChatSummary & { messages: Message[] };

const base = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
};

export async function* streamChat(
  messages: Message[],
  signal?: AbortSignal,
  opts?: { webSearch?: boolean }
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${base()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, web_search: opts?.webSearch ?? false }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error("Stream failed");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const payload = JSON.parse(part.slice(6)) as {
          chunk?: string;
          done?: boolean;
        };
        if (payload.chunk) yield payload.chunk;
        if (payload.done) return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const getMemory = () =>
  fetch(`${base()}/api/memory`).then<MemoryFact[]>((r) => r.json());

export const deleteMemoryFact = (id: string) =>
  fetch(`${base()}/api/memory/${id}`, { method: "DELETE" });

export const clearAllMemory = () =>
  fetch(`${base()}/api/memory`, { method: "DELETE" });

export const addMemoryFact = (fact: string) =>
  fetch(`${base()}/api/memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fact }),
  }).then<MemoryFact>((r) => r.json());

export const listChats = () =>
  fetch(`${base()}/api/chats`).then<ChatSummary[]>((r) => r.json());

export const getChat = (id: string) =>
  fetch(`${base()}/api/chats/${id}`).then<ChatFull>((r) => r.json());

export const createChat = (messages: Message[] = [], title?: string) =>
  fetch(`${base()}/api/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, title }),
  }).then<ChatFull>((r) => r.json());

export const updateChat = (
  id: string,
  patch: { messages?: Message[]; title?: string }
) =>
  fetch(`${base()}/api/chats/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then<ChatFull>((r) => r.json());

export const deleteChat = (id: string) =>
  fetch(`${base()}/api/chats/${id}`, { method: "DELETE" });
