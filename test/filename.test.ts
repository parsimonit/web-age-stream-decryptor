import { describe, expect, it } from "vitest";
import { filenameFor } from "../src/core/filename.ts";

describe("filenameFor — URL fallback", () => {
  it.each([
    ["https://example.com/report.pdf.age", "report.pdf"],
    ["https://example.com/data.zip", "data.zip"],
    ["https://example.com/", "download"],
    ["https://example.com/file.age?v=1#section", "file"],
    ["https://example.com/archive.tar.gz.age", "archive.tar.gz"],
    ["https://example.com/my%20report.pdf.age", "my report.pdf"],
    ["https://example.com/.age", "download"],
    ["not-a-url", "download"],
  ])("%s -> %s", (url, expected) => {
    expect(filenameFor(url)).toMatchObject({ name: expected, risky: false });
  });

  it("falls back to the URL when Content-Disposition has no filename", () => {
    expect(filenameFor("https://example.com/file.pdf.age", "attachment")).toEqual({
      name: "file.pdf",
      risky: false,
    });
  });

  it("keeps malformed percent escapes literal", () => {
    expect(filenameFor("https://example.com/%E0%A4%A.age")).toMatchObject({
      name: "%E0%A4%A",
    });
  });
});

describe("filenameFor — Content-Disposition", () => {
  it("prefers filename* over filename", () => {
    expect(
      filenameFor(
        "https://example.com/ignored.age",
        "attachment; filename=\"fallback.txt\"; filename*=UTF-8''real%20name.txt"
      )
    ).toEqual({ name: "real name.txt", risky: false });
  });

  it("decodes RFC 6266 filename* with language", () => {
    expect(
      filenameFor(
        "https://example.com/ignored.age",
        "attachment; filename*=utf-8'en'%E2%82%AC%20rates.pdf"
      )
    ).toMatchObject({ name: "€ rates.pdf" });
  });

  it("accepts quoted filename* values and values without a charset", () => {
    expect(
      filenameFor(
        "https://example.com/x.age",
        "attachment; filename*=\"UTF-8''quoted%20name.txt\""
      )
    ).toMatchObject({ name: "quoted name.txt" });
    expect(
      filenameFor("https://example.com/x.age", "attachment; filename*=plain.txt")
    ).toMatchObject({ name: "plain.txt" });
  });

  it("handles quoted and unquoted filename values", () => {
    expect(
      filenameFor("https://example.com/x.age", 'attachment; filename="quoted.txt"')
    ).toMatchObject({ name: "quoted.txt" });
    expect(
      filenameFor("https://example.com/x.age", "attachment; filename='single.txt'")
    ).toMatchObject({ name: "single.txt" });
    expect(
      filenameFor("https://example.com/x.age", "attachment; filename=plain.txt")
    ).toMatchObject({ name: "plain.txt" });
  });

  it("falls back when filename* cannot be decoded", () => {
    expect(
      filenameFor("https://example.com/x.age", "attachment; filename*=UTF-8''%E0%A4%A")
    ).toMatchObject({ name: "%E0%A4%A" });
  });
});

describe("filenameFor — sanitization", () => {
  it("removes traversal segments and path separators", () => {
    expect(
      filenameFor(
        "https://example.com/x.age",
        'attachment; filename="../../etc/passwd"'
      )
    ).toMatchObject({ name: "etcpasswd" });
    expect(
      filenameFor(
        "https://example.com/x.age",
        'attachment; filename="..\\..\\evil.exe"'
      )
    ).toEqual({ name: "evil.exe", risky: true });
  });

  it("removes control characters and bidi overrides", () => {
    expect(
      filenameFor(
        "https://example.com/x.age",
        'attachment; filename="safe\u0000\u202Etxt.exe"'
      )
    ).toEqual({ name: "safetxt.exe", risky: true });
  });

  it("trims dots/spaces and collapses whitespace", () => {
    expect(
      filenameFor(
        "https://example.com/x.age",
        'attachment; filename="  ..my   report.txt..  "'
      )
    ).toMatchObject({ name: "my report.txt" });
  });

  it("caps long names while keeping the extension", () => {
    const long = `${"a".repeat(250)}.txt`;
    const result = filenameFor(
      "https://example.com/x.age",
      `attachment; filename="${long}"`
    );
    expect(result.name).toBe(`${"a".repeat(196)}.txt`);
    expect(result.name).toHaveLength(200);
  });

  it("caps names whose extension alone is too long", () => {
    const long = `file.${"x".repeat(250)}`;
    const result = filenameFor(
      "https://example.com/x.age",
      `attachment; filename="${long}"`
    );
    expect(result.name).toBe(long.slice(0, 200));
  });

  it("caps long names without an extension", () => {
    const long = "a".repeat(250);
    const result = filenameFor(
      "https://example.com/x.age",
      `attachment; filename="${long}"`
    );
    expect(result.name).toBe(long.slice(0, 200));
  });

  it("falls back to 'download' when nothing usable remains", () => {
    expect(
      filenameFor("https://example.com/x.age", 'attachment; filename="..."')
    ).toMatchObject({ name: "download" });
  });
});

describe("filenameFor — risky extensions", () => {
  const risky = [
    "exe",
    "msi",
    "bat",
    "cmd",
    "com",
    "scr",
    "ps1",
    "vbs",
    "js",
    "jar",
    "sh",
    "app",
    "dmg",
    "apk",
    "lnk",
    "html",
    "htm",
    "svg",
    "hta",
    "pif",
  ];

  it("flags every listed extension", () => {
    for (const extension of risky) {
      expect(filenameFor(`https://example.com/file.${extension}.age`).risky).toBe(true);
    }
  });

  it("does not flag ordinary files or extensionless names", () => {
    for (const name of ["file.txt", "file.pdf", "file.zip", "README"]) {
      expect(filenameFor(`https://example.com/${name}.age`).risky).toBe(false);
    }
  });

  it("compares extensions case-insensitively", () => {
    expect(filenameFor("https://example.com/SETUP.EXE.age").risky).toBe(true);
  });
});
