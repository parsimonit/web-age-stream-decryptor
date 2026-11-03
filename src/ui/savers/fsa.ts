import { isAbortError } from "../../core/errors.ts";
import type { Saver } from "./types.ts";

interface PickerWritable {
  abort(): Promise<void>;
  close(): Promise<void>;
}

interface PickerFileHandle {
  createWritable(): Promise<PickerWritable & WritableStream<Uint8Array>>;
}

type ShowSaveFilePicker = (options?: {
  suggestedName?: string;
}) => Promise<PickerFileHandle>;

function getPicker(): ShowSaveFilePicker | undefined {
  const candidate = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  return typeof candidate === "function" ? candidate.bind(window) : undefined;
}

export function isFsaSupported(): boolean {
  return getPicker() !== undefined;
}

/** Streams straight to a user-chosen file, never buffering the payload. */
export const fsaSaver: Saver = {
  id: "fsa",
  canSave(): boolean {
    return isFsaSupported();
  },
  async save(source, filename, signal) {
    const picker = getPicker();
    if (!picker) throw new Error("File System Access API is unavailable");

    // Must run during the click handler: showSaveFilePicker needs user activation.
    // Only once the destination exists is the response stream consumed.
    let writable: (PickerWritable & WritableStream<Uint8Array>) | undefined;
    try {
      const handle = await picker({ suggestedName: filename });
      writable = await handle.createWritable();
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
      throw error;
    }

    try {
      await source().pipeTo(writable, signal ? { signal } : undefined);
    } catch (error) {
      // Abort so the browser discards the partial file instead of keeping it.
      await writable.abort().catch(() => undefined);
      throw error;
    }
    return "saved";
  },
};
