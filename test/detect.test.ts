import { describe, expect, it } from "vitest";
import { sniffContentType } from "../src/core/detect.ts";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const PDF = { kind: "pdf", mimeType: "application/pdf" };
const HTML = { kind: "html", mimeType: "text/html" };
const SVG = { kind: "svg", mimeType: "image/svg+xml" };
const BINARY = { kind: "binary", mimeType: "application/octet-stream" };

describe("sniffContentType", () => {
  it.each([
    ["%PDF-1.7", PDF],
    ["  %PDF-1.7", BINARY],
    ["", BINARY],
    ["<!doctype html><html></html>", HTML],
    ["\n\t  <!DOCTYPE HTML>", HTML],
    ["<html lang=en>", HTML],
    ["<HEAD>", HTML],
    ["<body>", HTML],
    ["<!-- a comment -->", HTML],
    ["<html><body><svg></svg></body></html>", HTML],
    ["<svg xmlns='http://www.w3.org/2000/svg'></svg>", SVG],
    ["  \n<svg></svg>", SVG],
    ["<?xml version='1.0'?><svg></svg>", SVG],
    ["<?xml version='1.0'?><root/>", BINARY],
    ["a plain text file", BINARY],
  ])("classifies %j", (input, expected) => {
    expect(sniffContentType(encode(input))).toEqual(expected);
  });

  it("skips a UTF-8 BOM before sniffing", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode("<html>")]);
    expect(sniffContentType(bytes)).toEqual(HTML);
  });

  it("only looks at the first 512 bytes after the preamble", () => {
    expect(sniffContentType(encode(`${"a".repeat(520)}<html>`))).toEqual(BINARY);
    expect(
      sniffContentType(encode(`<?xml version='1.0'?>${"a".repeat(520)}<svg>`))
    ).toEqual(BINARY);
  });

  it("classifies arbitrary binary data as binary", () => {
    expect(sniffContentType(new Uint8Array([0x00, 0x01, 0x02, 0xff]))).toEqual(BINARY);
  });
});
