import { describe, it, expect } from "vitest";
import { parseFragment, toDecryptRequest } from "../src/core/fragment.ts";

describe("parseFragment", () => {
  it("returns both params and disabled forceDownload by default", () => {
    const hash = "#u=https://example.com/file.age&pw=secret";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: false,
    });
  });

  it("enables forceDownload when d=1", () => {
    const hash = "#u=https://example.com/file.age&pw=secret&d=1";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: true,
    });
  });

  it("treats d=0 as forceDownload disabled", () => {
    const hash = "#u=https://example.com/file.age&pw=secret&d=0";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: false,
    });
  });

  it("treats malformed d value as forceDownload disabled", () => {
    const hash = "#u=https://example.com/file.age&pw=secret&d=yes";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: false,
    });
  });

  it("correctly decodes percent-encoded values", () => {
    const hash = "#u=https%3A%2F%2Fexample.com%2Ffile.age&pw=my%20pass%20phrase";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "my pass phrase",
      forceDownload: false,
    });
  });

  it("handles special characters in u (spaces, &, =, /)", () => {
    const encoded = encodeURIComponent("https://example.com/path?a=1&b=2");
    const hash = `#u=${encoded}&pw=test`;
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/path?a=1&b=2",
      passphrase: "test",
      forceDownload: false,
    });
  });

  it("handles base64-encoded passphrase with = padding", () => {
    const hash = "#u=https://example.com/file.age&pw=c2VjcmV0MTIz==";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "c2VjcmV0MTIz==",
      forceDownload: false,
    });
  });

  it("returns null when pw is missing", () => {
    const hash = "#u=https://example.com/file.age";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      forceDownload: false,
    });
  });

  it("returns partial params when u is missing", () => {
    const hash = "#pw=secret";
    const result = parseFragment(hash);

    expect(result).toEqual({
      passphrase: "secret",
      forceDownload: false,
    });
  });

  it("returns only forceDownload when both parameters are missing", () => {
    const hash = "#";
    const result = parseFragment(hash);

    expect(result).toEqual({ forceDownload: false });
  });

  it("returns only forceDownload for empty string", () => {
    const result = parseFragment("");

    expect(result).toEqual({ forceDownload: false });
  });

  it("returns only forceDownload for unparseable fragment", () => {
    const hash = "#garbage";
    const result = parseFragment(hash);

    expect(result).toEqual({ forceDownload: false });
  });

  it("works without leading # character", () => {
    const hash = "u=https://example.com/file.age&pw=secret";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: false,
    });
  });

  it("trims surrounding whitespace from decoded values", () => {
    const hash = "#u=%20https%3A%2F%2Fexample.com%2Ffile.age%20&pw=%20secret%20";
    const result = parseFragment(hash);

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: false,
    });
  });
});

describe("toDecryptRequest", () => {
  it("returns complete DecryptRequest when both required params are present", () => {
    const result = toDecryptRequest({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: true,
    });

    expect(result).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      forceDownload: true,
    });
  });

  it("returns null when fileUrl is missing", () => {
    const result = toDecryptRequest({
      passphrase: "secret",
      forceDownload: false,
    });
    expect(result).toBeNull();
  });

  it("returns null when passphrase is missing", () => {
    const result = toDecryptRequest({
      fileUrl: "https://example.com/file.age",
      forceDownload: false,
    });
    expect(result).toBeNull();
  });
});
