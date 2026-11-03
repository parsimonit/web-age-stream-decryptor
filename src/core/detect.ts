import type { ContentType } from "./types.ts";

const PDF: ContentType = { kind: "pdf", mimeType: "application/pdf" };
const HTML: ContentType = { kind: "html", mimeType: "text/html" };
const SVG: ContentType = { kind: "svg", mimeType: "image/svg+xml" };
const BINARY: ContentType = { kind: "binary", mimeType: "application/octet-stream" };

const SNIFF_WINDOW = 512;
const HTML_MARKERS = ["<!doctype html", "<html", "<head", "<body", "<!--"];
const ASCII_WHITESPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20]);

/**
 * Classifies the first bytes of a decrypted payload. HTML/SVG/PDF are the only
 * formats the review step may offer to view; everything else is binary.
 */
export function sniffContentType(head: Uint8Array): ContentType {
  // PDF signatures must sit exactly at offset 0 (leading whitespace is not valid).
  if (isPdf(head)) return PDF;

  const start = skipPreamble(head);
  const window = asciiLower(head.subarray(start, start + SNIFF_WINDOW));

  if (HTML_MARKERS.some((marker) => window.includes(marker))) return HTML;
  if (window.includes("<?xml")) {
    return window.includes("<svg") ? SVG : BINARY;
  }
  if (window.includes("<svg")) return SVG;
  return BINARY;
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

/** Skips a UTF-8 BOM followed by any ASCII whitespace. */
function skipPreamble(bytes: Uint8Array): number {
  let index = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    index = 3;
  }
  while (index < bytes.length && ASCII_WHITESPACE.has(bytes[index])) {
    index++;
  }
  return index;
}

function asciiLower(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte);
  }
  return text;
}
