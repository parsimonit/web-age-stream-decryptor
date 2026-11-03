import { allowedActions } from "./policy.ts";
import type {
  ContentType,
  Loaded,
  Review,
  ReviewWarning,
  StreamMeta,
} from "./types.ts";

export interface ReviewInput {
  fileUrl: string;
  urlWarning?: ReviewWarning;
  contentType: ContentType;
  filename: { name: string; risky: boolean };
  loaded: Loaded;
  meta: StreamMeta;
  saveOnly: boolean;
}

/** Builds everything the review step displays from core outputs. */
export function buildReview(input: ReviewInput): Review {
  const oversize = input.loaded.kind === "oversize";
  const warnings: ReviewWarning[] = [];
  if (input.urlWarning) warnings.push(input.urlWarning);
  if (input.filename.risky) warnings.push("risky-extension");

  return {
    host: hostOf(input.fileUrl),
    filename: input.filename.name,
    contentType: input.contentType,
    size:
      input.loaded.kind === "complete"
        ? input.loaded.bytes.length
        : input.meta.contentLength,
    oversize,
    actions: allowedActions(input.contentType, oversize, input.saveOnly),
    warnings,
  };
}

function hostOf(fileUrl: string): string {
  try {
    return new URL(fileUrl).hostname;
  } catch {
    return "";
  }
}
