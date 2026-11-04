import type { ReviewWarning } from "../core/types.ts";

/** Single source of user-facing copy for review/form warnings. */
export function warningText(warning: ReviewWarning): string {
  switch (warning) {
    case "insecure-http":
      return "The file is served over plain HTTP, so it could be modified in transit.";
    case "risky-extension":
      return "The file name has an executable or script extension. Open it only if you trust the source.";
  }
}
