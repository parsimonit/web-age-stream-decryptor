import type { Review } from "../../core/types.ts";
import type { Saver } from "./types.ts";

/** Collects a stream into a single buffer. Only used for payloads under the cap. */
async function collect(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function triggerDownload(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;

  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

/** Buffered fallback for browsers without the File System Access API. */
export const anchorSaver: Saver = {
  id: "anchor",
  canSave(review: Review): boolean {
    return !review.oversize;
  },
  async save(stream, filename): Promise<void> {
    triggerDownload(await collect(stream), filename);
  },
};
