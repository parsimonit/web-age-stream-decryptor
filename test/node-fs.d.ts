// Minimal ambient declaration for the one Node built-in the interop test needs.
// The project does not ship @types/node, so this declares just the signature we
// use (readFileSync also accepts a file URL, returning a Buffer at runtime).
declare module "node:fs" {
  export function readFileSync(path: string | URL): Uint8Array;
}
