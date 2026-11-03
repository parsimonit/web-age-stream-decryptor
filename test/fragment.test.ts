import { describe, expect, it } from "vitest";
import { parseFragment } from "../src/core/fragment.ts";

describe("parseFragment", () => {
  it("parses both params and leaves saveOnly off by default", () => {
    expect(parseFragment("#u=https://example.com/file.age&pw=secret")).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "secret",
      saveOnly: false,
    });
  });

  it("enables saveOnly only for d=1", () => {
    for (const value of ["0", "yes", "", "true"]) {
      expect(
        parseFragment(`#u=https://example.com/f.age&pw=p&d=${value}`)
      ).toMatchObject({ saveOnly: false });
    }
    expect(parseFragment("#u=https://example.com/f.age&pw=p&d=1")).toMatchObject({
      saveOnly: true,
    });
  });

  it("decodes percent-encoded values", () => {
    expect(
      parseFragment("#u=https%3A%2F%2Fexample.com%2Ffile.age&pw=my%20pass%20phrase")
    ).toEqual({
      fileUrl: "https://example.com/file.age",
      passphrase: "my pass phrase",
      saveOnly: false,
    });
  });

  it("handles special characters in the URL", () => {
    const encoded = encodeURIComponent("https://example.com/path?a=1&b=2");
    expect(parseFragment(`#u=${encoded}&pw=test`)).toMatchObject({
      fileUrl: "https://example.com/path?a=1&b=2",
      passphrase: "test",
    });
  });

  it("keeps a whitespace-padded passphrase verbatim", () => {
    expect(
      parseFragment("#u=%20https%3A%2F%2Fexample.com%2Ff.age%20&pw=%20secret%20")
    ).toEqual({
      fileUrl: "https://example.com/f.age",
      passphrase: " secret ",
      saveOnly: false,
    });
  });

  it("keeps an explicitly empty passphrase", () => {
    expect(parseFragment("#pw=")).toEqual({ passphrase: "", saveOnly: false });
  });

  it("omits absent fields", () => {
    expect(parseFragment("#u=https://example.com/f.age")).toEqual({
      fileUrl: "https://example.com/f.age",
      saveOnly: false,
    });
    expect(parseFragment("#pw=secret")).toEqual({
      passphrase: "secret",
      saveOnly: false,
    });
  });

  it("handles empty, bare and unparseable fragments", () => {
    for (const hash of ["", "#", "#garbage"]) {
      expect(parseFragment(hash)).toEqual({ saveOnly: false });
    }
  });

  it("works without a leading #", () => {
    expect(parseFragment("u=https://example.com/f.age&pw=secret")).toEqual({
      fileUrl: "https://example.com/f.age",
      passphrase: "secret",
      saveOnly: false,
    });
  });

  it("keeps base64-style padding in the passphrase", () => {
    expect(parseFragment("#pw=c2VjcmV0MTIz==")).toMatchObject({
      passphrase: "c2VjcmV0MTIz==",
    });
  });
});
