// Shared contracts between src/core (pure logic) and src/ui (DOM).

export type ContentType =
  | { kind: "html"; mimeType: "text/html" }
  | { kind: "svg"; mimeType: "image/svg+xml" }
  | { kind: "pdf"; mimeType: "application/pdf" }
  | { kind: "binary"; mimeType: "application/octet-stream" };

/**
 * Every failure surfaced to the user. Browsers deliberately do not distinguish
 * CORS from network failures, so both map to "network".
 */
export type AppError =
  | { kind: "network" } // fetch rejected (offline, DNS, CORS, blocked)
  | { kind: "fetch"; status: number } // HTTP status outside 2xx
  | { kind: "mixed-content" } // https page asked to fetch non-loopback http
  | { kind: "format" } // not an age file / unsupported header
  | { kind: "decrypt" } // wrong passphrase or tampered/corrupt payload
  | { kind: "interrupted" }; // connection dropped while streaming

/** Parsed `#u=...&pw=...[&d=1]`. All fields optional: the form is only prefilled. */
export interface FragmentParams {
  fileUrl?: string;
  passphrase?: string;
  /** `d=1`: offer Save only, never View. */
  saveOnly: boolean;
}

/** What the user submitted from the form. */
export interface DecryptRequest {
  fileUrl: string;
  passphrase: string;
  saveOnly: boolean;
}

/** Response headers that matter; all optional (CORS hides most of them). */
export interface StreamMeta {
  contentLength?: number;
  contentDisposition?: string;
}

/** A decrypted stream whose read errors are already mapped to AppError. */
export interface OpenedStream {
  stream: ReadableStream<Uint8Array>;
  meta: StreamMeta;
}

/**
 * Result of reading a decrypted stream up to the buffer cap.
 * - complete: whole payload (<= cap) is in memory.
 * - oversize: payload exceeds cap; `prefix` holds what was read (bounded by
 *   cap + one chunk) and `rest` is the still-unread remainder of the SAME
 *   request (never re-fetched).
 */
export type Loaded =
  | { kind: "complete"; bytes: Uint8Array }
  | { kind: "oversize"; prefix: Uint8Array[]; rest: ReadableStream<Uint8Array> };

export type Action = "view" | "save";

export type ReviewWarning =
  | "insecure-http" // file URL is plain http (non-loopback)
  | "risky-extension"; // sanitized filename has an executable/script extension

/** Everything the review step shows; derived purely from core outputs. */
export interface Review {
  host: string; // hostname of the fetched URL
  filename: string; // sanitized
  contentType: ContentType;
  size: number | undefined; // exact when Loaded.complete, else Content-Length if known
  oversize: boolean;
  actions: Action[]; // from policy
  warnings: ReviewWarning[];
}

export type AppState =
  | { phase: "idle"; error?: AppError; warning?: ReviewWarning }
  | { phase: "loading"; host: string }
  | { phase: "review"; review: Review }
  | { phase: "viewing"; review: Review; scripts: boolean }
  | { phase: "saving"; review: Review }
  | { phase: "saved"; review: Review };
