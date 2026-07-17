import type { DecryptResult } from "../core/types.ts";

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], {
    type: "application/octet-stream",
  });
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 100);
}

/**
 * Renders a successful DecryptResult.
 * For viewable content (HTML/PDF), replaces the current page.
 * For binary content, triggers download and shows status message.
 */
export function renderResult(
  result: DecryptResult,
  forceDownload = false
): void {
  if (!forceDownload && (result.contentType.kind === "html" || result.contentType.kind === "pdf")) {
    // US-01.1: replace the current document with the decrypted Blob URL.
    const blob = new Blob([result.bytes], { type: result.contentType.mimeType });
    const blobUrl = URL.createObjectURL(blob);
    location.replace(blobUrl);
    return;
  }

  const statusArea = document.getElementById("status-area");
  // Binary always downloads. HTML/PDF also download when forceDownload is enabled.
  triggerDownload(result.bytes, result.filename);

  if (statusArea) {
    clearStatusArea();
    const message = document.createElement("div");
    message.style.padding = "2rem";
    message.style.textAlign = "center";
    message.style.color = "#555";
    message.textContent = `Download started: ${result.filename}`;
    statusArea.appendChild(message);
  }
}

/**
 * Clears the status area.
 */
export function clearStatusArea(): void {
  const statusArea = document.getElementById("status-area");
  if (statusArea) {
    statusArea.innerHTML = "";
  }
}
