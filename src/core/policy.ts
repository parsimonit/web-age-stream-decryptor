import type { Action, ContentType } from "./types.ts";

const VIEWABLE = new Set<string>(["html", "svg", "pdf"]);

/**
 * Viewing is only offered for small html/svg/pdf payloads and never in
 * save-only mode. Saving is always possible.
 */
export function allowedActions(
  contentType: ContentType,
  oversize: boolean,
  saveOnly: boolean
): Action[] {
  const canView = !oversize && !saveOnly && VIEWABLE.has(contentType.kind);
  return canView ? ["view", "save"] : ["save"];
}
