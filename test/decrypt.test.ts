import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppError } from "../src/core/types.ts";
import { fetchAndDecrypt } from "../src/core/decrypt.ts";

describe("fetchAndDecrypt — error classification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies localhost TypeError as 'network'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      fetchAndDecrypt("http://localhost/file.age", "pass")
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("classifies 127.0.0.1 TypeError as 'network'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      fetchAndDecrypt("http://127.0.0.1/file.age", "pass")
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("classifies Chrome remote TypeError ('Failed to fetch') as 'cors'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      fetchAndDecrypt("https://remote.example.com/file.age", "pass")
    ).rejects.toMatchObject({ kind: "cors" });
  });

  it("classifies Firefox remote TypeError ('NetworkError when attempting to fetch resource.') as 'cors'", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError("NetworkError when attempting to fetch resource.")
        )
    );
    await expect(
      fetchAndDecrypt("https://remote.example.com/file.age", "pass")
    ).rejects.toMatchObject({ kind: "cors" });
  });

  it("classifies Safari remote TypeError ('Load failed') as 'cors'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));
    await expect(
      fetchAndDecrypt("https://remote.example.com/file.age", "pass")
    ).rejects.toMatchObject({ kind: "cors" });
  });

  it("classifies HTTP 405 response (same-origin) as 'fetch' with status 405", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 405 }));
    await expect(
      fetchAndDecrypt("http://localhost/file.age", "pass")
    ).rejects.toMatchObject({ kind: "fetch", status: 405 });
  });

  it("classifies HTTP 404 response as 'fetch' with status 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      fetchAndDecrypt("https://remote.example.com/file.age", "pass")
    ).rejects.toMatchObject({ kind: "fetch", status: 404 });
  });

  it("classifies malformed URL as 'network'", async () => {
    await expect(fetchAndDecrypt("not-a-url", "pass")).rejects.toMatchObject({
      kind: "network",
    });
  });
});

// AppError type coverage
describe("AppError type coverage", () => {
  it("supports all 5 error kinds", () => {
    const errors: AppError[] = [
      { kind: "network" },
      { kind: "fetch", status: 500 },
      { kind: "cors" },
      { kind: "decrypt" },
      { kind: "format" },
    ];

    expect(errors).toHaveLength(5);
    expect(errors[0].kind).toBe("network");
    expect(errors[1].kind).toBe("fetch");
    expect(errors[2].kind).toBe("cors");
    expect(errors[3].kind).toBe("decrypt");
    expect(errors[4].kind).toBe("format");
  });
});
