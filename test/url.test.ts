import { describe, expect, it } from "vitest";
import { checkUrl } from "../src/core/url.ts";

describe("checkUrl", () => {
  it("rejects malformed URLs as network errors", () => {
    expect(checkUrl("not a url", "https:")).toEqual({
      ok: false,
      error: { kind: "network" },
    });
  });

  it("rejects non-http(s) schemes as network errors", () => {
    for (const url of [
      "ftp://example.com/file.age",
      "file:///tmp/file.age",
      "javascript:alert(1)",
    ]) {
      expect(checkUrl(url, "https:")).toEqual({
        ok: false,
        error: { kind: "network" },
      });
    }
  });

  it("blocks non-loopback http from an https page as mixed-content", () => {
    expect(checkUrl("http://example.com/file.age", "https:")).toEqual({
      ok: false,
      error: { kind: "mixed-content" },
    });
  });

  it("warns about non-loopback http on an http page", () => {
    expect(checkUrl("http://example.com/file.age", "http:")).toEqual({
      ok: true,
      host: "example.com",
      warning: "insecure-http",
    });
  });

  it("accepts https URLs without warnings", () => {
    expect(checkUrl("https://cdn.example.com/file.age", "https:")).toEqual({
      ok: true,
      host: "cdn.example.com",
    });
  });

  it("exempts loopback hosts from mixed-content blocking", () => {
    for (const url of [
      "http://localhost:8080/file.age",
      "http://127.0.0.1/file.age",
      "http://127.42.0.9/file.age",
      "http://[::1]:8080/file.age",
    ]) {
      expect(checkUrl(url, "https:")).toMatchObject({ ok: true });
    }
  });

  it("keeps the hostname (including IPv6 brackets) in the result", () => {
    expect(checkUrl("https://[::1]/file.age", "https:")).toEqual({
      ok: true,
      host: "[::1]",
    });
  });
});
