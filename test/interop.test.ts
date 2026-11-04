import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { openDecryptedStream } from "../src/core/stream.ts";
import { loadUpTo } from "../src/core/buffer.ts";

/**
 * Interop tests against fixtures produced by the real age CLI v1.3.2
 * (scrypt passphrase encryption, default work factor). Regenerate with:
 *
 *   devbox run -- bash scripts/make-fixtures.sh
 *
 * scrypt is deliberately slow, so each test gets a generous timeout.
 */
const TEST_TIMEOUT_MS = 30_000;
/** Larger than any fixture; keeps the whole plaintext in one Loaded.complete. */
const TEST_CAP = 4 * 1024 * 1024;

const DEFAULT_PASSPHRASE = "correct horse battery staple";
// Leading/trailing spaces and a non-ASCII character are intentional.
const SPACES_PASSPHRASE = " pässword with spaces ";

interface Fixture {
  /** Encrypted fixture name under test/fixtures/. */
  ciphertext: string;
  /** Plaintext original name under test/fixtures/plain/. */
  plaintext: string;
  passphrase: string;
}

const FIXTURES: Fixture[] = [
  {
    ciphertext: "hello.txt.age",
    plaintext: "hello.txt",
    passphrase: DEFAULT_PASSPHRASE,
  },
  {
    ciphertext: "page.html.age",
    plaintext: "page.html",
    passphrase: DEFAULT_PASSPHRASE,
  },
  { ciphertext: "doc.pdf.age", plaintext: "doc.pdf", passphrase: DEFAULT_PASSPHRASE },
  { ciphertext: "blob.bin.age", plaintext: "blob.bin", passphrase: DEFAULT_PASSPHRASE },
  { ciphertext: "empty.age", plaintext: "empty.bin", passphrase: DEFAULT_PASSPHRASE },
  {
    ciphertext: "multichunk.bin.age",
    plaintext: "multichunk.bin",
    passphrase: DEFAULT_PASSPHRASE,
  },
  {
    ciphertext: "with-spaces.age",
    plaintext: "with-spaces.txt",
    passphrase: SPACES_PASSPHRASE,
  },
];

function readFixture(relativePath: string): Uint8Array {
  return readFileSync(new URL(`./fixtures/${relativePath}`, import.meta.url));
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function stubFetchWithBytes(bytes: Uint8Array): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes as unknown as BodyInit, { status: 200 }))
  );
}

async function decryptFixture(name: string, passphrase: string): Promise<Uint8Array> {
  const opened = await openDecryptedStream(
    `https://fixtures.example/${name}`,
    passphrase
  );
  const loaded = await loadUpTo(opened.stream, TEST_CAP);
  if (loaded.kind !== "complete") {
    throw new Error("fixture exceeded the test buffer cap");
  }
  return loaded.bytes;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("real-age interop — openDecryptedStream + loadUpTo", () => {
  for (const fixture of FIXTURES) {
    it(
      `decrypts ${fixture.ciphertext} to the exact plaintext bytes`,
      async () => {
        const ciphertext = readFixture(fixture.ciphertext);
        const expected = readFixture(`plain/${fixture.plaintext}`);
        stubFetchWithBytes(ciphertext);

        const actual = await decryptFixture(fixture.ciphertext, fixture.passphrase);

        expect(actual.length).toBe(expected.length);
        expect(toHex(actual)).toBe(toHex(expected));
      },
      TEST_TIMEOUT_MS
    );
  }

  it(
    "preserves the exact bytes of the multi-chunk (~200 KiB) fixture",
    async () => {
      const ciphertext = readFixture("multichunk.bin.age");
      const expected = readFixture("plain/multichunk.bin");
      expect(expected.length).toBe(200 * 1024);

      stubFetchWithBytes(ciphertext);
      const actual = await decryptFixture("multichunk.bin.age", DEFAULT_PASSPHRASE);

      expect(actual.length).toBe(200 * 1024);
      expect(toHex(actual)).toBe(toHex(expected));
    },
    TEST_TIMEOUT_MS
  );

  it(
    "rejects a wrong passphrase with kind 'decrypt'",
    async () => {
      stubFetchWithBytes(readFixture("hello.txt.age"));

      await expect(
        openDecryptedStream(
          "https://fixtures.example/hello.txt.age",
          "wrong passphrase"
        )
      ).rejects.toMatchObject({ kind: "decrypt" });
    },
    TEST_TIMEOUT_MS
  );
});
