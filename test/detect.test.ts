import { describe, it, expect } from "vitest";
import { detectContentType, extractFilename } from "../src/core/detect.ts";

describe("detectContentType", () => {
  it("detects PDF from %PDF signature", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    expect(detectContentType(pdf)).toEqual({
      kind: "pdf",
      mimeType: "application/pdf",
    });
  });

  it("detects HTML from <! signature", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html>");
    expect(detectContentType(html)).toEqual({
      kind: "html",
      mimeType: "text/html",
    });
  });

  it("detects HTML from <html signature (lowercase)", () => {
    const html = new TextEncoder().encode("<html>");
    expect(detectContentType(html)).toEqual({
      kind: "html",
      mimeType: "text/html",
    });
  });

  it("detects HTML from <HTML signature (uppercase)", () => {
    const html = new TextEncoder().encode("<HTML>");
    expect(detectContentType(html)).toEqual({
      kind: "html",
      mimeType: "text/html",
    });
  });

  it("defaults to binary for unknown content", () => {
    const binary = new Uint8Array([0x00, 0x01, 0x02]);
    expect(detectContentType(binary)).toEqual({
      kind: "binary",
      mimeType: "application/octet-stream",
    });
  });

  it("handles empty array", () => {
    const empty = new Uint8Array([]);
    expect(detectContentType(empty)).toEqual({
      kind: "binary",
      mimeType: "application/octet-stream",
    });
  });

  it("handles arrays shorter than 5 bytes", () => {
    const short = new Uint8Array([0x3c]); // Just '<'
    expect(detectContentType(short)).toEqual({
      kind: "binary",
      mimeType: "application/octet-stream",
    });
  });
});

describe("extractFilename", () => {
  it("extracts filename and strips .age extension", () => {
    expect(extractFilename("https://example.com/report.pdf.age")).toBe("report.pdf");
  });

  it("extracts filename without .age extension", () => {
    expect(extractFilename("https://example.com/data.zip")).toBe("data.zip");
  });

  it("returns 'download' for root URL", () => {
    expect(extractFilename("https://example.com/")).toBe("download");
  });

  it("strips query string", () => {
    expect(extractFilename("https://example.com/file.age?v=1")).toBe("file");
  });

  it("strips fragment", () => {
    expect(extractFilename("https://example.com/file.age#section")).toBe("file");
  });

  it("handles multiple dots in filename", () => {
    expect(extractFilename("https://example.com/archive.tar.gz.age")).toBe(
      "archive.tar.gz"
    );
  });

  it("returns 'download' for invalid URL", () => {
    expect(extractFilename("not-a-url")).toBe("download");
  });

  it("returns 'download' when path is empty after .age strip", () => {
    expect(extractFilename("https://example.com/.age")).toBe("download");
  });
});
