import { describe, expect, it, vi } from "vitest";
import { bytesToStream, joinStream, loadUpTo } from "../src/core/buffer.ts";
import { readAll, streamOf } from "./helpers.ts";

function payload(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = i % 251;
  return bytes;
}

describe("loadUpTo", () => {
  it.each([
    { cap: 0, length: 0, kind: "complete" },
    { cap: 10, length: 9, kind: "complete" },
    { cap: 10, length: 10, kind: "complete" },
    { cap: 10, length: 11, kind: "oversize" },
  ] as const)("cap $cap with $length bytes -> $kind", async ({ cap, length, kind }) => {
    const bytes = payload(length);
    const loaded = await loadUpTo(bytesToStream(bytes), cap);

    expect(loaded.kind).toBe(kind);
    if (loaded.kind === "complete") {
      expect(loaded.bytes).toEqual(bytes);
    } else {
      expect(await readAll(joinStream(loaded.prefix, loaded.rest))).toEqual(bytes);
    }
  });

  it("stops pulling once the cap is exceeded", async () => {
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(4).fill(pulls));
        },
      },
      { highWaterMark: 0 }
    );

    const loaded = await loadUpTo(source, 10);
    expect(loaded.kind).toBe("oversize");
    expect(pulls).toBe(3); // 4 + 4 + 4 > 10; the fourth chunk is never requested
    if (loaded.kind === "oversize") {
      const prefixLength = loaded.prefix.reduce((sum, c) => sum + c.length, 0);
      expect(prefixLength).toBe(12);
      await loaded.rest.cancel();
    }
  });

  it("rejoins prefix and rest byte-exactly from variably sized chunks", async () => {
    const bytes = payload(100);
    const chunks = [
      bytes.subarray(0, 3),
      bytes.subarray(3, 10),
      bytes.subarray(10, 10),
      bytes.subarray(10, 40),
      bytes.subarray(40, 41),
      bytes.subarray(41),
    ];
    const loaded = await loadUpTo(streamOf(chunks), 20);

    expect(loaded.kind).toBe("oversize");
    if (loaded.kind === "oversize") {
      expect(await readAll(joinStream(loaded.prefix, loaded.rest))).toEqual(bytes);
    }
  });
});

describe("joinStream", () => {
  it("propagates cancellation to the rest stream", async () => {
    const cancel = vi.fn();
    const rest = new ReadableStream<Uint8Array>({ cancel });
    const joined = joinStream([new Uint8Array([1, 2])], rest);
    const reader = joined.getReader();

    expect(await reader.read()).toEqual({
      done: false,
      value: new Uint8Array([1, 2]),
    });
    await reader.cancel("stop");
    expect(cancel).toHaveBeenCalledWith("stop");
  });
});

describe("bytesToStream", () => {
  it("streams the given bytes unchanged", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await readAll(bytesToStream(bytes))).toEqual(bytes);
  });

  it("streams an empty payload", async () => {
    expect(await readAll(bytesToStream(new Uint8Array()))).toEqual(new Uint8Array());
  });
});
