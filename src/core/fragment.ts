import type { FragmentParams } from "./types.ts";

/**
 * Builds `u=<file-url>&pw=<passphrase>[&d=1]` without the leading `#`.
 *
 * Both values are encoded verbatim: the passphrase and URL are not trimmed or
 * otherwise altered, so a link round-trips through `parseFragment`.
 */
export function buildFragment(req: {
  fileUrl: string;
  passphrase: string;
  saveOnly: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("u", req.fileUrl);
  params.set("pw", req.passphrase);
  if (req.saveOnly) params.set("d", "1");
  return params.toString();
}

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
