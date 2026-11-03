import type { FragmentParams } from "./types.ts";

/**
 * Parses `#u=<file-url>&pw=<passphrase>[&d=1]`.
 *
 * The passphrase is kept verbatim (it may legitimately start or end with
 * spaces); only the URL is trimmed. Missing keys stay undefined.
 */
export function parseFragment(hash: string): FragmentParams {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const fileUrl = params.get("u")?.trim();
  const passphrase = params.get("pw");

  const result: FragmentParams = { saveOnly: params.get("d") === "1" };
  if (fileUrl) result.fileUrl = fileUrl;
  if (passphrase !== null) result.passphrase = passphrase;
  return result;
}
