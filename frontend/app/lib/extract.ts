"use client";

// Client-side extraction: text files via FileReader, PDFs via pdf.js.

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "html",
  "htm", "css", "scss", "js", "jsx", "ts", "tsx", "py", "rb", "rs", "go",
  "java", "kt", "c", "cc", "cpp", "h", "hpp", "sh", "bash", "zsh", "sql",
  "toml", "ini", "env", "log", "tex", "vue", "svelte",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function extractText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker is copied from node_modules into /public at build-time setup.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
}

export async function extractFile(file: File): Promise<string> {
  const ext = extOf(file.name);
  if (ext === "pdf" || file.type === "application/pdf") {
    return await extractPdf(file);
  }
  if (TEXT_EXTS.has(ext) || file.type.startsWith("text/")) {
    return await extractText(file);
  }
  // Fallback: try as text; many "unknown" files are plain text anyway.
  return await extractText(file);
}
