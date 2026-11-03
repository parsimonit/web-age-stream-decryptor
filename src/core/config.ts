/** Max bytes held in browser memory (viewable / anchor-saveable payloads). */
export const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Parses a user-supplied cap (e.g. build-time env); falls back to the default. */
export function resolveMaxBufferBytes(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_BUFFER_BYTES;
}
