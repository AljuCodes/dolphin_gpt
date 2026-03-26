export type Message = { role: "user" | "assistant"; content: string };
export type MemoryFact = { id: string; fact: string };

const base = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function* streamChat(
  messages: Message[],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${base()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
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
