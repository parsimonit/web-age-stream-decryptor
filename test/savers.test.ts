import { describe, expect, it } from "vitest";
import type { Review } from "../src/core/types.ts";
import { parseSaverOverride, selectSaver } from "../src/ui/savers/index.ts";

function review(oversize: boolean): Review {
  return {
    host: "example.test",
    filename: "payload.bin",
    contentType: { kind: "binary", mimeType: "application/octet-stream" },
    size: oversize ? undefined : 12,
    oversize,
    actions: ["save"],
    warnings: [],
  };
}

const both = { fsa: true, sw: true };
const neither = { fsa: false, sw: false };

describe("selectSaver", () => {
  it("prefers File System Access wherever the picker exists", () => {
    expect(selectSaver(review(false), both)?.id).toBe("fsa");
    expect(selectSaver(review(true), both)?.id).toBe("fsa");
    expect(selectSaver(review(true), { fsa: true, sw: false })?.id).toBe("fsa");
  });

  it("streams oversize payloads through the service worker without FSA", () => {
    expect(selectSaver(review(true), { fsa: false, sw: true })?.id).toBe("sw");
  });

  it("keeps the anchor fallback for payloads that fit in memory", () => {
    expect(selectSaver(review(false), neither)?.id).toBe("anchor");
    expect(selectSaver(review(false), { fsa: false, sw: true })?.id).toBe("anchor");
  });

  it("refuses oversize payloads when neither streaming path exists", () => {
    expect(selectSaver(review(true), neither)).toBeNull();
  });

  it("honours a capable override", () => {
    expect(selectSaver(review(true), both, "sw")?.id).toBe("sw");
    expect(selectSaver(review(false), both, "anchor")?.id).toBe("anchor");
    expect(selectSaver(review(false), both, "fsa")?.id).toBe("fsa");
    expect(selectSaver(review(false), neither, "sw")).toBeNull();
  });

  it("refuses an override that cannot handle the review", () => {
    expect(selectSaver(review(true), both, "anchor")).toBeNull();
    expect(selectSaver(review(true), neither, "fsa")).toBeNull();
    expect(selectSaver(review(false), both, "anchor")?.id).toBe("anchor");
  });

  it("ignores unknown overrides and falls back to the default order", () => {
    expect(parseSaverOverride("nope")).toBeUndefined();
    expect(parseSaverOverride(null)).toBeUndefined();
    expect(parseSaverOverride("sw")).toBe("sw");
    expect(selectSaver(review(true), both, parseSaverOverride("nope"))?.id).toBe("fsa");
  });
});
