import { Decrypter } from "age-encryption";
import type { AppError, OpenedStream, StreamMeta } from "./types.ts";

/**
 * Fetches and starts decrypting an age file. The age header is validated before
 * this resolves; payload read failures are mapped to `AppError` on the returned
 * stream. Exactly one request is made; the body is never buffered here.
 */
export async function openDecryptedStream(
  fileUrl: string,
  passphrase: string,
  signal?: AbortSignal
): Promise<OpenedStream> {
  const response = await fetchResponse(fileUrl, signal);
  if (!response.ok) {
    throw { kind: "fetch", status: response.status } as AppError;
  }
  if (!response.body) {
    throw { kind: "network" } as AppError;
  }

  const meta = readMeta(response.headers);
  const decrypted = await decryptBody(response.body, passphrase);
  return { stream: mapReadErrors(decrypted), meta };
}

async function fetchResponse(fileUrl: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(fileUrl, signal ? { signal } : undefined);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw { kind: "network" } as AppError;
  }
}

async function decryptBody(
  body: ReadableStream<Uint8Array>,
  passphrase: string
): Promise<ReadableStream<Uint8Array>> {
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);
  try {
    return await decrypter.decrypt(body);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw classifyHeaderError(error);
  }
}

function readMeta(headers: Headers): StreamMeta {
  const length = headers.get("content-length");
  const disposition = headers.get("content-disposition");
  return {
    contentLength: length !== null && /^\d+$/.test(length) ? Number(length) : undefined,
    contentDisposition: disposition === null ? undefined : disposition,
  };
}

/** Wraps a plaintext stream so payload read failures become typed errors. */
function mapReadErrors(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        } catch (error) {
          controller.error(
            isNetworkError(error) ? { kind: "interrupted" } : { kind: "decrypt" }
          );
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 }
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("fetch failed") ||
    message.includes("terminated") ||
    message.includes("connection")
  );
}

/**
 * The age library throws plain `Error`s. Only a missing identity means the
 * passphrase was wrong; every other header failure means the data is not a
 * supported age file.
 */
function classifyHeaderError(error: unknown): AppError {
  if (isNetworkError(error)) return { kind: "interrupted" };
  const message = error instanceof Error ? error.message : String(error);
  return /no identity matched/i.test(message)
    ? { kind: "decrypt" }
    : { kind: "format" };
}
