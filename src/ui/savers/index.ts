import type { Review } from "../../core/types.ts";
import { anchorSaver } from "./anchor.ts";
import { fsaSaver, isFsaSupported } from "./fsa.ts";
import { isSwSupported, swSaver } from "./sw.ts";
import type { Saver, SaverId } from "./types.ts";

export { SaverUnavailableError } from "./sw.ts";
export type { Saver, SaverId } from "./types.ts";

/** Browser capabilities the choice depends on, injectable for unit tests. */
export interface SaverCaps {
  fsa: boolean;
  sw: boolean;
}

/** Test hook: `?saver=fsa|sw|anchor` forces one destination (see README). */
export type SaverOverride = SaverId;

const OVERRIDES: readonly SaverId[] = ["fsa", "sw", "anchor"];

export function parseSaverOverride(raw: string | null): SaverOverride | undefined {
  return raw !== null && (OVERRIDES as readonly string[]).includes(raw)
    ? (raw as SaverOverride)
    : undefined;
}

function supports(id: SaverId, caps: SaverCaps): boolean {
  switch (id) {
    case "fsa":
      return caps.fsa;
    case "sw":
      return caps.sw;
    case "anchor":
      return true;
  }
}

/**
 * Prefers streaming to disk. The buffered anchor is only used for payloads that
 * already fit in memory; an override that cannot handle the review is refused
 * (the caller shows the usual "cannot stream this file" message).
 */
export function selectSaver(
  review: Review,
  caps: SaverCaps,
  override?: SaverOverride
): Saver | null {
  if (override) {
    if (!supports(override, caps)) return null;
    if (override === "anchor" && review.oversize) return null;
    return override === "fsa" ? fsaSaver : override === "sw" ? swSaver : anchorSaver;
  }

  if (caps.fsa) return fsaSaver;
  if (review.oversize) return caps.sw ? swSaver : null;
  return anchorSaver;
}

/** Browser-side entry point: detects capabilities, then selects. */
export function pickSaver(review: Review, override?: SaverOverride): Saver | null {
  return selectSaver(review, { fsa: isFsaSupported(), sw: isSwSupported() }, override);
}
