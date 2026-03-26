"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${apiUrl}/api/hello?name=dolphin_gpt`)
      .then((r) => r.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Could not reach API"));
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-8 py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-4xl font-bold tracking-tight text-black dark:text-white">
          dolphin_gpt
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          {message ?? "Connecting to API…"}
        </p>
      </main>
    </div>
  );
}
