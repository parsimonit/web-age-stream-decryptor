// Shared type definitions for the Age Browser Decryptor

export type ContentType =
  | { kind: "html"; mimeType: "text/html" }
  | { kind: "pdf"; mimeType: "application/pdf" }
  | { kind: "binary"; mimeType: "application/octet-stream" };

export type AppError =
  | { kind: "network" }
  | { kind: "fetch"; status: number }
  | { kind: "cors" }
  | { kind: "decrypt" }
  | { kind: "format" };

export interface DecryptRequest {
  fileUrl: string;
  passphrase: string;
  forceDownload: boolean;
}

export interface FragmentParams {
  fileUrl?: string;
  passphrase?: string;
  forceDownload: boolean;
}

export interface DecryptResult {
  bytes: Uint8Array;
  contentType: ContentType;
  filename: string;
}

export type AppState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; result: DecryptResult }
  | { phase: "error"; error: AppError };
