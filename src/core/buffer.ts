import type { Loaded } from "./types.ts";

/**
 * Reads a decrypted stream until it ends or exceeds `cap` bytes.
 *
 * Stops pulling as soon as the total passes `cap`, so an oversize payload holds
 * at most `cap` + one chunk in `prefix`; the rest of the same request is left
 * unread in `rest`.
 */
export async function loadUpTo(
  stream: ReadableStream<Uint8Array>,
  cap: number
): Promise<Loaded> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      reader.releaseLock();
      return { kind: "complete", bytes: concat(chunks, total) };
    }

    chunks.push(value);
    total += value.length;
    if (total > cap) {
      return { kind: "oversize", prefix: chunks, rest: readerStream(reader) };
    }
  }
}

/** Joins already-read `prefix` chunks with the unread `rest` of the stream. */
export function joinStream(
  prefix: Uint8Array[],
  rest: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const reader = rest.getReader();
  let index = 0;

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (index < prefix.length) {
          controller.enqueue(prefix[index++]);
          return;
        }
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 }
  );
}

/** Wraps in-memory bytes in a one-chunk stream. */
export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function readerStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 }
  );
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
