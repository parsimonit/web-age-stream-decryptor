import type { AppError } from "../core/types.ts";

/** Human-readable copy for every failure the app can surface. */
export function errorMessage(error: AppError): string {
  switch (error.kind) {
    case "network":
      return "Network error while fetching the file. The server may be unreachable or may not allow cross-origin requests (CORS).";
    case "fetch":
      return `The server returned HTTP ${error.status} instead of the file.`;
    case "mixed-content":
      return "This page is served over HTTPS and cannot fetch plain http:// URLs.";
    case "format":
      return "This file is not a valid age-encrypted file.";
    case "decrypt":
      return "Decryption failed: the passphrase is wrong, or the file is corrupted or tampered with.";
    case "interrupted":
      return "The connection was interrupted while downloading the file.";
  }
}

export function errorElement(): HTMLElement | null {
  return document.getElementById("error-banner");
}

/** Shows a message in the live error banner. */
export function showErrorMessage(message: string): void {
  const banner = errorElement();
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = false;
}

export function showError(error: AppError): void {
  showErrorMessage(errorMessage(error));
}

export function clearError(): void {
  const banner = errorElement();
  if (!banner) return;
  banner.textContent = "";
  banner.hidden = true;
}
