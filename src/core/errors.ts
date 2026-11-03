/**
 * True for an `AbortError`, whether it is a real `DOMException` or a plain
 * object carrying the same name (test doubles, cross-realm errors).
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
