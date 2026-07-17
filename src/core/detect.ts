import type { ContentType } from "./types.ts";

/**
 * Inspects the leading bytes of a decrypted payload and returns the content type.
 *
 * Detection is magic-byte based (first 8 bytes):
 *   - `%PDF`          → { kind: "pdf",    mimeType: "application/pdf" }
 *   - `<!` / `<html`  → { kind: "html",   mimeType: "text/html" }
 *   - anything else   → { kind: "binary", mimeType: "application/octet-stream" }
 *
 * @param bytes - First bytes of the decrypted plaintext (minimum 8 bytes recommended;
 *                works on shorter arrays with degraded detection for small files).
 * @returns     ContentType discriminated union.
 */
export function detectContentType(bytes: Uint8Array): ContentType {
  // Check for PDF signature: %PDF (hex: 25 50 44 46)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return { kind: "pdf", mimeType: "application/pdf" };
  }

  // Check for HTML signatures: <! or <html or <HTML
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x21) {
    // <! (likely <!DOCTYPE or <!--)
    return { kind: "html", mimeType: "text/html" };
  }

  if (bytes.length >= 5) {
    const text = new TextDecoder().decode(bytes.slice(0, 5)).toLowerCase();
    if (text === "<html") {
      return { kind: "html", mimeType: "text/html" };
    }
  }

  // Default: binary
  return { kind: "binary", mimeType: "application/octet-stream" };
}

/**
 * Derives a suggested download filename from the encrypted file URL.
 *
 * Takes the last path segment of the URL, strips query string and fragment,
 * then strips a trailing `.age` extension if present. Falls back to "download"
 * if the URL has no path segment.
 *
 * @param fileUrl - The URL that was used to fetch the encrypted file.
 * @returns       A filename string suitable for use in an `<a download>` attribute.
 *
 * @example
 *   extractFilename("https://example.com/report.pdf.age") // → "report.pdf"
 *   extractFilename("https://example.com/data.zip")       // → "data.zip"
 *   extractFilename("https://example.com/")               // → "download"
 *   extractFilename("https://example.com/file.age?v=1")   // → "file"
 */
export function extractFilename(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname;
    const segments = pathname.split("/").filter((s) => s.length > 0);

    if (segments.length === 0) {
      return "download";
    }

    let filename = segments[segments.length - 1];

    // Strip .age extension if present
    if (filename.endsWith(".age")) {
      filename = filename.slice(0, -4);
    }

    return filename || "download";
  } catch {
    return "download";
  }
}
