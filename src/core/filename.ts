const MAX_FILENAME_LENGTH = 200;

const RISKY_EXTENSIONS = new Set([
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
]);

/** Control characters plus Unicode bidi overrides/isolates. */
// eslint-disable-next-line no-control-regex -- stripping them is the point
const STRIP_CHARS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

export interface FilenameInfo {
  name: string;
  risky: boolean;
}

/**
 * Picks a safe download/view filename from Content-Disposition, falling back to
 * the last URL segment. The result never contains path separators and is capped
 * at 200 characters while keeping its extension.
 */
export function filenameFor(
  fileUrl: string,
  contentDisposition?: string
): FilenameInfo {
  const headerName = contentDisposition
    ? filenameFromHeader(contentDisposition)
    : undefined;
  const name = sanitize(headerName || filenameFromUrl(fileUrl));
  return { name, risky: isRisky(name) };
}

function filenameFromHeader(header: string): string | undefined {
  return parseExtendedFilename(header) || parsePlainFilename(header);
}

/** RFC 6266 `filename*=charset'lang'percent-encoded`. */
function parseExtendedFilename(header: string): string | undefined {
  const match = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (!match) return undefined;

  const value = unquote(match[1].trim());
  const encoded = /^[^']*'[^']*'(.*)$/.exec(value)?.[1] ?? value;
  return decodeComponent(encoded);
}

function parsePlainFilename(header: string): string | undefined {
  const match = /filename\s*=\s*("([^"]*)"|'([^']*)'|[^;]+)/i.exec(header);
  if (!match) return undefined;
  if (match[2] !== undefined) return match[2].replace(/\\"/g, '"');
  if (match[3] !== undefined) return match[3];
  return (match[1] ?? "").trim();
}

function filenameFromUrl(fileUrl: string): string {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return "download";
  }
  const segment = url.pathname.split("/").pop() ?? "";
  return decodeComponent(segment).replace(/\.age$/i, "");
}

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitize(raw: string): string {
  let name = raw
    .replace(STRIP_CHARS, "")
    .replace(/[\\/]+/g, "")
    .replace(/\.\./g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  if (name.length > MAX_FILENAME_LENGTH) {
    name = truncate(name, MAX_FILENAME_LENGTH);
  }
  return name || "download";
}

function truncate(name: string, max: number): string {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  if (extension.length >= max) return name.slice(0, max);
  return name.slice(0, max - extension.length) + extension;
}

function isRisky(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && RISKY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}
