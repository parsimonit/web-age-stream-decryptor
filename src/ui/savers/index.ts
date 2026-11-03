import type { Review } from "../../core/types.ts";
import { anchorSaver } from "./anchor.ts";
import { fsaSaver } from "./fsa.ts";
import type { Saver } from "./types.ts";

export type { Saver } from "./types.ts";

/**
 * Prefers streaming to disk. Falling back to the buffered anchor is only
 * possible when the payload already fits in memory.
 */
export function pickSaver(review: Review): Saver | null {
  if (fsaSaver.canSave(review)) return fsaSaver;
  if (anchorSaver.canSave(review)) return anchorSaver;
  return null;
}
