import { vi } from "vitest";
import { Encrypter } from "age-encryption";

/** Low scrypt work factor keeps unit tests fast; interop tests use real age files. */
export const FAST_WORK_FACTOR = 10;
export const PASSPHRASE = "correct horse battery staple";

export async function encrypt(
  bytes: Uint8Array | string,
  passphrase = PASSPHRASE,
  workFactor = FAST_WORK_FACTOR
): Promise<Uint8Array> {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  encrypter.setScryptWorkFactor(workFactor);
  return encrypter.encrypt(bytes);
}

export function stubFetchBytes(bytes: Uint8Array, headers?: HeadersInit): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(bytes as unknown as BodyInit, { status: 200, headers })
    )
  );
}

export function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index++]);
        } else {
          controller.close();
        }
      },
    },
    { highWaterMark: 0 }
  );
}

/**
 * Re-slices `bytes` into a stream whose chunk sizes come from `nextSize`, one
 * chunk per pull. Real networks deliver arbitrary, unaligned reads, unlike a
 * Blob or a whole-buffer Response; this makes those boundaries reproducible.
 */
export function rechunkedStream(
  bytes: Uint8Array,
  nextSize: () => number
): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const size = Math.max(
          1,
          Math.min(Math.trunc(nextSize()), bytes.length - offset)
        );
        controller.enqueue(bytes.subarray(offset, offset + size));
        offset += size;
      },
    },
    { highWaterMark: 0 }
  );
}

/** Seeded 0..1 generator, so a "random network" case is identical every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Seeded chunk sizes in `[1, max]`, matching a fragmented network read. */
export function seededChunkSizes(seed: number, max: number): () => number {
  const random = seededRandom(seed);
  return () => 1 + Math.floor(random() * max);
}

export async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.releaseLock();

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
