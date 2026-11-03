import type { Review } from "../../core/types.ts";

/**
 * A destination for decrypted bytes. Implementations must not buffer when the
 * payload is too large to fit in memory (stream straight to disk).
 */
export interface Saver {
  id: "fsa" | "anchor";
  canSave(review: Review): boolean;
  save(stream: ReadableStream<Uint8Array>, filename: string): Promise<void>;
}
