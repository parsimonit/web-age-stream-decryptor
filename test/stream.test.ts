import { afterEach, describe, expect, it, vi } from "vitest";
import { openDecryptedStream } from "../src/core/stream.ts";
import { loadUpTo } from "../src/core/buffer.ts";
import {
  encrypt,
  PASSPHRASE,
  readAll,
  rechunkedStream,
  seededChunkSizes,
  stubFetchBytes,
} from "./helpers.ts";

const FILE_URL = "https://example.com/file.age";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeResponse(init: {
  ok?: boolean;
  status?: number;
  body?: ReadableStream<Uint8Array> | null;
  headers?: HeadersInit;
}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new Headers(init.headers),
    body: init.body ?? null,
  } as unknown as Response;
}

function streamThatErrors(error: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.error(error);
      },
    },
    { highWaterMark: 0 }
  );
}

/** Byte offset just past the age header (the 16-byte nonce follows it). */
function headerEnd(ciphertext: Uint8Array): number {
  const text = new TextDecoder().decode(ciphertext);
  const macLine = text.indexOf("\n--- ");
  const lineEnd = text.indexOf("\n", macLine + 1);
  if (macLine < 0 || lineEnd < 0) throw new Error("age header not found");
  return lineEnd + 1;
}

describe("openDecryptedStream — success", () => {
  it("decrypts the payload and exposes response metadata", async () => {
    const plaintext = new TextEncoder().encode("hello world");
    const ciphertext = await encrypt(plaintext);
    stubFetchBytes(ciphertext, {
      "content-length": String(ciphertext.length),
      "content-disposition": 'attachment; filename="hello.txt"',
    });

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);

    expect(opened.meta).toEqual({
      contentLength: ciphertext.length,
      contentDisposition: 'attachment; filename="hello.txt"',
    });
    expect(await readAll(opened.stream)).toEqual(plaintext);
  });

  it("omits metadata that is absent or invalid", async () => {
    const ciphertext = await encrypt(new Uint8Array([1, 2, 3]));
    stubFetchBytes(ciphertext, { "content-length": "not-a-number" });

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);

    expect(opened.meta).toEqual({
      contentLength: undefined,
      contentDisposition: undefined,
    });
  });

  it("decrypts an empty payload", async () => {
    stubFetchBytes(await encrypt(new Uint8Array()));
    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    expect(await readAll(opened.stream)).toEqual(new Uint8Array());
  });

  it("propagates cancellation to the decrypted stream", async () => {
    stubFetchBytes(await encrypt(new Uint8Array([1, 2, 3])));
    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    await expect(opened.stream.cancel("stop")).resolves.toBeUndefined();
  });
});

describe("openDecryptedStream — network fragmentation", () => {
  /**
   * Real network bodies arrive in arbitrary, unaligned chunks: a few KiB, odd
   * sizes, and boundaries that split the age header line, the 16-byte payload
   * nonce, the 64 KiB ciphertext chunks and their 16-byte tags. Earlier tests
   * fed Blob-sized or whole-buffer chunks, so they never crossed those
   * boundaries. These cases guard against network-fragmentation bugs.
   */
  const FIXED = [1, 7, 16, 100, 1024, 4096, 16384, 65535, 65536, 65537];
  const RANDOM_SMALL = "seeded random 1–300-byte chunks";
  const RANDOM_MIX = "seeded random 1–20000-byte chunks";

  const chunkers = new Map<string, () => () => number>();
  for (const size of FIXED) {
    chunkers.set(`${size}-byte chunks`, () => () => size);
  }
  chunkers.set(RANDOM_SMALL, () => seededChunkSizes(0x5eed, 300));
  chunkers.set(RANDOM_MIX, () => seededChunkSizes(0x5eed, 20_000));

  const fixedLabels = (sizes: number[]) => sizes.map((size) => `${size}-byte chunks`);

  const matrix: { size: number; labels: string[] }[] = [
    { size: 0, labels: fixedLabels([1, 65536]) },
    { size: 1, labels: fixedLabels([1, 7, 16]) },
    { size: 100, labels: fixedLabels([1, 7, 16, 100]) },
    {
      size: 65536, // exactly one age chunk: its tag sits at the boundary
      labels: fixedLabels([7, 100, 1024, 4096, 16384, 65535, 65536, 65537]).concat(
        RANDOM_MIX
      ),
    },
    {
      size: 65537, // one full chunk plus a one-byte tail
      labels: fixedLabels([7, 100, 1024, 4096, 16384, 65535, 65536, 65537]).concat(
        RANDOM_MIX
      ),
    },
    {
      size: 131072,
      labels: fixedLabels([100, 1024, 4096, 16384, 65535, 65536, 65537]).concat(
        RANDOM_SMALL,
        RANDOM_MIX
      ),
    },
    {
      size: 1024 * 1024,
      labels: fixedLabels([4096, 16384, 65536, 65537]).concat(RANDOM_MIX),
    },
  ];

  const plaintexts = new Map<number, Uint8Array>();
  const ciphertexts = new Map<number, Uint8Array>();
  function plaintextFor(size: number): Uint8Array {
    let bytes = plaintexts.get(size);
    if (!bytes) {
      bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = i % 251;
      plaintexts.set(size, bytes);
    }
    return bytes;
  }
  async function ciphertextFor(size: number): Promise<Uint8Array> {
    let bytes = ciphertexts.get(size);
    if (!bytes) {
      bytes = await encrypt(plaintextFor(size));
      ciphertexts.set(size, bytes);
    }
    return bytes;
  }

  const cases = matrix.flatMap(({ size, labels }) =>
    labels.map((label) => {
      const make = chunkers.get(label);
      if (!make) throw new Error(`unknown chunking ${label}`);
      return { size, label: `${size} plaintext bytes in ${label}`, make };
    })
  );

  /** Element-wise compare: deep-equality on multi-MiB arrays is very slow. */
  function sameBytes(actual: Uint8Array, expected: Uint8Array): boolean {
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  it.each(cases)("decrypts $label byte-exactly", async ({ size, make }) => {
    const plaintext = plaintextFor(size);
    const ciphertext = await ciphertextFor(size);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(rechunkedStream(ciphertext, make()), { status: 200 })
      )
    );

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    const loaded = await loadUpTo(opened.stream, plaintext.length);

    expect(loaded.kind).toBe("complete");
    if (loaded.kind === "complete") {
      expect(loaded.bytes.length).toBe(plaintext.length);
      expect(sameBytes(loaded.bytes, plaintext)).toBe(true);
    }
  });

  it("decrypts a valid body delivered as one chunk above the header cap", async () => {
    // A fast server, or a Response built from a whole buffer, can hand over the
    // file in a single read. The header sits inside it, so it must not be
    // rejected as an over-long header.
    const plaintext = plaintextFor(5 * 1024 * 1024);
    stubFetchBytes(await ciphertextFor(5 * 1024 * 1024));

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    const loaded = await loadUpTo(opened.stream, plaintext.length);

    expect(loaded.kind).toBe("complete");
    if (loaded.kind === "complete") {
      expect(loaded.bytes.length).toBe(plaintext.length);
      expect(sameBytes(loaded.bytes, plaintext)).toBe(true);
    }
  }, 30_000);
});

describe("openDecryptedStream — fetch errors", () => {
  it("passes the abort signal to fetch and rethrows AbortError unchanged", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    const fetchMock = vi.fn(async () => {
      throw abortError;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      openDecryptedStream(FILE_URL, PASSPHRASE, controller.signal)
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(FILE_URL, {
      signal: controller.signal,
    });
  });

  it("maps rejected fetches to network errors", async () => {
    for (const error of [new TypeError("Failed to fetch"), new Error("boom")]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw error;
        })
      );
      await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toMatchObject({
        kind: "network",
      });
    }
  });

  it("maps non-2xx responses to fetch errors with their status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ ok: false, status: 404 }))
    );
    await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toMatchObject({
      kind: "fetch",
      status: 404,
    });
  });

  it("maps a missing response body to a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ body: null }))
    );
    await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toMatchObject({
      kind: "network",
    });
  });
});

describe("openDecryptedStream — age header failures", () => {
  it("maps a non-age payload to a format error", async () => {
    stubFetchBytes(new TextEncoder().encode("this is not an age file"));
    await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toMatchObject({
      kind: "format",
    });
  });

  it("maps a wrong passphrase to a decrypt error", async () => {
    stubFetchBytes(await encrypt(new TextEncoder().encode("secret")));
    await expect(
      openDecryptedStream(FILE_URL, "wrong passphrase")
    ).rejects.toMatchObject({
      kind: "decrypt",
    });
  });

  it("maps a network failure while reading the header to interrupted", async () => {
    for (const error of [
      new TypeError("Failed to fetch"),
      new Error("network reset"),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => fakeResponse({ body: streamThatErrors(error) }))
      );
      await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toMatchObject({
        kind: "interrupted",
      });
    }
  });

  it("rethrows an AbortError raised while reading the header", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ body: streamThatErrors(abortError) }))
    );
    await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toBe(abortError);
  });

  it("fails fast when no header line arrives within 4 MiB and cancels the body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(new Uint8Array(64 * 1024).fill(0x41));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ body }))
    );

    await expect(openDecryptedStream(FILE_URL, PASSPHRASE)).rejects.toMatchObject({
      kind: "format",
    });
    expect(cancelled).toBe(true);
  });
});

describe("openDecryptedStream — payload failures", () => {
  it("maps a tampered payload to a decrypt error on the stream", async () => {
    const ciphertext = await encrypt(new Uint8Array(1024).fill(7));
    ciphertext[ciphertext.length - 1] ^= 0xff;
    stubFetchBytes(ciphertext);

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    await expect(readAll(opened.stream)).rejects.toMatchObject({
      kind: "decrypt",
    });
  });

  it("maps a truncated payload to a decrypt error on the stream", async () => {
    const ciphertext = await encrypt(new Uint8Array(1024).fill(7));
    stubFetchBytes(ciphertext.slice(0, ciphertext.length - 10));

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    await expect(readAll(opened.stream)).rejects.toMatchObject({
      kind: "decrypt",
    });
  });

  it("maps a network failure after the header to interrupted on the stream", async () => {
    const ciphertext = await encrypt(new Uint8Array(200 * 1024).fill(7));
    const headerBytes = headerEnd(ciphertext) + 16;
    let pulls = 0;

    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++;
          if (pulls === 1) {
            controller.enqueue(ciphertext.subarray(0, headerBytes));
          } else if (pulls === 2) {
            controller.enqueue(
              ciphertext.subarray(headerBytes, headerBytes + 64 * 1024 + 16)
            );
          } else {
            controller.error(new TypeError("Failed to fetch"));
          }
        },
      },
      { highWaterMark: 0 }
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeResponse({ body }))
    );

    const opened = await openDecryptedStream(FILE_URL, PASSPHRASE);
    await expect(readAll(opened.stream)).rejects.toMatchObject({
      kind: "interrupted",
    });
  });
});
