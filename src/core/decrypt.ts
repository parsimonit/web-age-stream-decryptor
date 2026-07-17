import { Decrypter } from "age-encryption";
import type { AppError } from "./types.ts";

/**
 * Fetches a remote age-encrypted file and decrypts it using the given passphrase.
 *
 * This function follows the corrected API pattern from research.md R-01:
 * - Uses Decrypter with streaming input (ReadableStream)
 * - Collects chunks into a Uint8Array
 * - Never references passphrase after this function returns/rejects
 * - Always throws AppError (never raw Error)
 *
 * @param fileUrl   - Absolute URL of the age-encrypted file. Must be reachable
 *                    and the host must send CORS headers for cross-origin requests.
 * @param passphrase - Passphrase for symmetric age decryption. Used in-memory only;
 *                     not stored or transmitted.
 * @returns         Resolves with the raw plaintext bytes on success.
 * @throws          {AppError} on any failure — network, CORS, HTTP, decryption, or
 *                  format error. Never throws a raw Error; always wraps into AppError.
 */
export async function fetchAndDecrypt(
  fileUrl: string,
  passphrase: string
): Promise<Uint8Array> {
  // Validate URL before fetch to distinguish malformed URLs from network/CORS errors
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    throw { kind: "network" } as AppError;
  }

  let response: Response;

  try {
    response = await fetch(fileUrl);
  } catch (error: unknown) {
    // Network error or CORS block.
    // When a cross-origin server responds with a non-2xx status AND omits CORS headers
    // (e.g. HTTP 405), the browser throws a TypeError before JS can read the status code.
    // We cannot recover the actual HTTP status in that case, but we can still classify
    // the error by whether the URL is local or remote.
    if (error instanceof TypeError) {
      const message = (error as Error).message.toLowerCase();

      const isLocalhost =
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname === "127.0.0.1" ||
        parsedUrl.hostname.startsWith("192.168.") ||
        parsedUrl.hostname.startsWith("10.");

      // Same-origin / localhost failures are definitively network errors
      // (connection refused, DNS failure, etc.)
      if (isLocalhost) {
        throw { kind: "network" } as AppError;
      }

      // Node-specific connection error codes (used in tests / SSR environments)
      if (message.includes("enotfound") || message.includes("econnrefused")) {
        throw { kind: "network" } as AppError;
      }

      // For all other remote URLs, any TypeError is a cross-origin / CORS failure.
      // Chrome:  "Failed to fetch"
      // Firefox: "NetworkError when attempting to fetch resource."
      // Safari:  "Load failed"
      // All of these mean the browser blocked the response due to missing CORS headers.
      throw { kind: "cors" } as AppError;
    }
    throw { kind: "network" } as AppError;
  }

  // Check HTTP status
  if (!response.ok) {
    throw { kind: "fetch", status: response.status } as AppError;
  }

  // Decrypt using age-encryption
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);

  let plaintextStream: ReadableStream<Uint8Array>;

  try {
    // Use streaming overload (no second argument) per research.md R-01
    plaintextStream = (await decrypter.decrypt(
      response.body!
    )) as unknown as ReadableStream<Uint8Array>;
  } catch (error: unknown) {
    // Decryption failure (wrong passphrase or invalid format)
    // Differentiate between format error and decrypt error by message inspection
    const message = (error as Error).message?.toLowerCase() || "";
    if (
      message.includes("invalid") ||
      message.includes("header") ||
      message.includes("format")
    ) {
      throw { kind: "format" } as AppError;
    }
    throw { kind: "decrypt" } as AppError;
  }

  // Collect all chunks into a single Uint8Array
  const chunks: Uint8Array[] = [];
  const reader = plaintextStream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
    // Stream reading error (likely decrypt error during streaming)
    throw { kind: "decrypt" } as AppError;
  }

  // Merge chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}
