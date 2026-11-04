import { describe, expect, it } from "vitest";
import { allowedActions } from "../src/core/policy.ts";
import type { ContentType } from "../src/core/types.ts";

const HTML: ContentType = { kind: "html", mimeType: "text/html" };
const SVG: ContentType = { kind: "svg", mimeType: "image/svg+xml" };
const PDF: ContentType = { kind: "pdf", mimeType: "application/pdf" };
const BINARY: ContentType = { kind: "binary", mimeType: "application/octet-stream" };

describe("allowedActions", () => {
  it.each([
    { type: HTML, oversize: false, saveOnly: false, expected: ["view", "save"] },
    { type: SVG, oversize: false, saveOnly: false, expected: ["view", "save"] },
    { type: PDF, oversize: false, saveOnly: false, expected: ["view", "save"] },
    { type: BINARY, oversize: false, saveOnly: false, expected: ["save"] },
    { type: HTML, oversize: true, saveOnly: false, expected: ["save"] },
    { type: HTML, oversize: false, saveOnly: true, expected: ["save"] },
    { type: BINARY, oversize: true, saveOnly: true, expected: ["save"] },
  ])(
    "$type.kind oversize=$oversize saveOnly=$saveOnly",
    ({ type, oversize, saveOnly, expected }) => {
      expect(allowedActions(type, oversize, saveOnly)).toEqual(expected);
    }
  );
});
