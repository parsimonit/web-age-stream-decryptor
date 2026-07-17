import type { DecryptRequest, FragmentParams } from "./types.ts";

/**
 * Parses a URL fragment hash into fragment parameters.
 *
 * Expected format: #u=<encoded-file-url>&pw=<encoded-passphrase>[&d=1]
 *
 * - `u` and `pw` are optional for prefill flows.
 * - `d=1` enables force-download mode.
 * - Any other `d` value (or missing `d`) leaves force-download disabled.
 */
export function parseFragmentParams(hash: string): FragmentParams {
  // Strip leading '#' if present
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;

  // Parse as URLSearchParams
  const params = new URLSearchParams(cleanHash);

  const fileUrl = params.get("u")?.trim() || undefined;
  const passphrase = params.get("pw")?.trim() || undefined;
  const forceDownload = params.get("d") === "1";

  const result: FragmentParams = { forceDownload };

  if (fileUrl) {
    result.fileUrl = fileUrl;
  }
  if (passphrase) {
    result.passphrase = passphrase;
  }

  return result;
}

/**
 * Parses a URL fragment into partial params (for prefill and auto-decrypt checks).
 */
export function parseFragment(hash: string): FragmentParams {
  return parseFragmentParams(hash);
}

/**
 * Builds a complete DecryptRequest from parsed fragment params.
 * Returns null when required values are missing.
 */
export function toDecryptRequest(params: FragmentParams): DecryptRequest | null {
  if (!params.fileUrl || !params.passphrase) {
    return null;
  }

  return {
    fileUrl: params.fileUrl,
    passphrase: params.passphrase,
    forceDownload: params.forceDownload,
  };
}
