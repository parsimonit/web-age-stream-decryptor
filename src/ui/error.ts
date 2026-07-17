import type { AppError } from "../core/types.ts";

/**
 * Displays a human-readable error banner for the given AppError.
 */
export function showError(error: AppError): void {
  const banner = document.getElementById("error-banner")!;
  let message: string;

  switch (error.kind) {
    case "network":
      message = "Network error while fetching the file.";
      break;
    case "fetch":
      message = `HTTP error while fetching the file (HTTP ${error.status}).`;
      break;
    case "cors":
      message =
        "Cannot fetch this URL: CORS policy blocked the request. Ensure the server sends CORS headers, or self-host the encrypted file on the same origin.";
      break;
    case "decrypt":
      message = "Decryption failed: incorrect passphrase or corrupted file.";
      break;
    case "format":
      message = "File does not appear to be a valid age-encrypted file.";
      break;
  }

  banner.textContent = message;
  banner.classList.add("show");
}

/**
 * Hides the error banner.
 */
export function clearError(): void {
  const banner = document.getElementById("error-banner")!;
  banner.textContent = "";
  banner.classList.remove("show");
}
