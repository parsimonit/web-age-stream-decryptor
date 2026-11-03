import type { AppError } from "./types.ts";

export type UrlCheck =
  | { ok: true; host: string; warning?: "insecure-http" }
  | { ok: false; error: AppError };

/**
 * Validates a file URL against the page's protocol.
 *
 * Browsers block plain `http://` requests from HTTPS pages except to loopback,
 * so those are rejected early as `mixed-content`.
 */
export function checkUrl(fileUrl: string, pageProtocol: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return { ok: false, error: { kind: "network" } };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: { kind: "network" } };
  }

  if (url.protocol === "http:" && !isLoopback(url.hostname)) {
    if (pageProtocol === "https:") {
      return { ok: false, error: { kind: "mixed-content" } };
    }
    return { ok: true, host: url.hostname, warning: "insecure-http" };
  }

  return { ok: true, host: url.hostname };
}

/** Loopback hosts are exempt from browser mixed-content blocking. */
function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
