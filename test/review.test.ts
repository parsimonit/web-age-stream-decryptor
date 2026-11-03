import { describe, expect, it } from "vitest";
import { buildReview } from "../src/core/review.ts";
import { bytesToStream } from "../src/core/buffer.ts";
import type { ContentType, Loaded } from "../src/core/types.ts";

const HTML: ContentType = { kind: "html", mimeType: "text/html" };
const PDF: ContentType = { kind: "pdf", mimeType: "application/pdf" };

const complete = (length: number): Loaded => ({
  kind: "complete",
  bytes: new Uint8Array(length),
});

const oversize = (): Loaded => ({
  kind: "oversize",
  prefix: [new Uint8Array([1, 2])],
  rest: bytesToStream(new Uint8Array()),
});

describe("buildReview", () => {
  it("reports exact size and actions for a complete payload", () => {
    expect(
      buildReview({
        fileUrl: "https://cdn.example.com/files/page.html.age",
        contentType: HTML,
        filename: { name: "page.html", risky: false },
        loaded: complete(42),
        meta: { contentLength: 999 },
        saveOnly: false,
      })
    ).toEqual({
      host: "cdn.example.com",
      filename: "page.html",
      contentType: HTML,
      size: 42,
      oversize: false,
      actions: ["view", "save"],
      warnings: [],
    });
  });

  it("uses Content-Length for oversize payloads and collects warnings", () => {
    expect(
      buildReview({
        fileUrl: "http://example.com/blob.exe.age",
        urlWarning: "insecure-http",
        contentType: HTML,
        filename: { name: "blob.exe", risky: true },
        loaded: oversize(),
        meta: { contentLength: 12_345 },
        saveOnly: false,
      })
    ).toMatchObject({
      host: "example.com",
      size: 12_345,
      oversize: true,
      actions: ["save"],
      warnings: ["insecure-http", "risky-extension"],
    });
  });

  it("leaves size undefined when an oversize payload has no Content-Length", () => {
    expect(
      buildReview({
        fileUrl: "https://example.com/big.bin.age",
        contentType: PDF,
        filename: { name: "big.bin", risky: false },
        loaded: oversize(),
        meta: {},
        saveOnly: true,
      })
    ).toMatchObject({ size: undefined, actions: ["save"], warnings: [] });
  });

  it("reports zero bytes as an exact size", () => {
    expect(
      buildReview({
        fileUrl: "https://example.com/empty.age",
        contentType: PDF,
        filename: { name: "empty", risky: false },
        loaded: complete(0),
        meta: {},
        saveOnly: false,
      })
    ).toMatchObject({ size: 0, oversize: false });
  });

  it("tolerates an unparseable URL", () => {
    expect(
      buildReview({
        fileUrl: "not a url",
        contentType: PDF,
        filename: { name: "x", risky: false },
        loaded: complete(1),
        meta: {},
        saveOnly: false,
      }).host
    ).toBe("");
  });
});
