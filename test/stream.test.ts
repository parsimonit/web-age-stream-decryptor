import { afterEach, describe, expect, it, vi } from "vitest";
import { openDecryptedStream } from "../src/core/stream.ts";
import { encrypt, PASSPHRASE, readAll, stubFetchBytes } from "./helpers.ts";

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
