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
  async save(stream, filename): Promise<void> {
    const picker = getPicker();
    if (!picker) throw new Error("File System Access API is unavailable");

    // Must run during the click handler: showSaveFilePicker needs user activation.
    const handle = await picker({ suggestedName: filename });
    const writable = await handle.createWritable();

    try {
      await stream.pipeTo(writable);
    } catch (error) {
      // Abort so the browser discards the partial file instead of keeping it.
      await writable.abort().catch(() => undefined);
      throw error;
    }
  },
};
