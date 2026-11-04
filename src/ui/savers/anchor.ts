import type { Review } from "../../core/types.ts";
import type { Saver } from "./types.ts";

function triggerDownload(blob: Blob, filename: string): void {
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
  async save(source, filename, signal) {
    const blob = await new Response(source()).blob();
    if (signal?.aborted) throw signal.reason;
    triggerDownload(blob, filename);
    return "saved";
  },
};
