import type { Review } from "../../core/types.ts";

/** `cancelled` means the user dismissed the destination picker. */
export type SaveOutcome = "saved" | "cancelled";

/** Destination kind: File System Access, service-worker download, or anchor. */
export type SaverId = "fsa" | "sw" | "anchor";

/**
 * A destination for decrypted bytes. Implementations must not buffer when the
 * payload is too large to fit in memory (stream straight to disk).
 *
 * The source is a factory so the destination exists before the (single, already
 * in-flight) response stream is consumed.
 */
export interface Saver {
  id: SaverId;
  canSave(review: Review): boolean;
  save(
    source: () => ReadableStream<Uint8Array>,
    filename: string,
    signal?: AbortSignal
  ): Promise<SaveOutcome>;
}
