import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_BUFFER_BYTES, resolveMaxBufferBytes } from "../src/core/config.ts";

describe("resolveMaxBufferBytes", () => {
  it("falls back to the default for missing or invalid values", () => {
    for (const raw of [undefined, "", "abc", "0", "-1", "1.5"]) {
      expect(resolveMaxBufferBytes(raw)).toBe(DEFAULT_MAX_BUFFER_BYTES);
    }
  });

  it("accepts positive integers", () => {
    expect(resolveMaxBufferBytes("1024")).toBe(1024);
    expect(resolveMaxBufferBytes(String(DEFAULT_MAX_BUFFER_BYTES))).toBe(
      DEFAULT_MAX_BUFFER_BYTES
    );
  });
});
