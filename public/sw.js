/**
 * Service-worker download engine for payloads too large to hold in memory.
 *
 * The page (src/ui/savers/sw.ts) owns the decrypted stream; this worker only
 * relays it into a browser download, so the plaintext still never touches a
 * server. Everything is pull-based, so disk speed (not memory) sets the pace.
 *
 * Protocol (all messages are structured-clone objects; `id` is a UUID):
 *   page -> worker   { type: "register", id, filename, size?, port: MessagePort }
 *                    `port` is transferred; `size` is the exact plaintext length
 *                    when the page knows it (normally omitted: for oversize
 *                    payloads the response's Content-Length is ciphertext).
 *   worker -> page   { type: "registered" }                    on the port
 *                    { type: "pull" }        one per chunk request, on the port
 *                    { type: "cancel" }      the browser dropped the download
 *   page -> worker   { type: "chunk", data: ArrayBuffer }      transferred
 *                    { type: "done" } | { type: "error" } | { type: "abort" }
 *                    { type: "ping" }        keep-alive, sent with
 *                    worker.postMessage: a port message does not reset the
 *                    worker's idle timer, so it cannot keep it alive.
 *
 * Security properties:
 * - Only ids registered by this page within the last minute are answered, and
 *   each id is consumed on first use. Nothing is persisted, so a restarted
 *   worker loses its entries and unguessable/expired ids get a plain 404.
 * - The worker never caches and never issues its own network requests: any
 *   request that is not a registered download is left alone (no respondWith).
 * - Sandboxed viewer documents have an opaque origin, so they cannot reach this
 *   worker's registration at all.
 */

const DOWNLOAD_DIR = "__download__/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Registrations never consumed by a navigation are dropped after a minute. */
const ID_TTL_MS = 60_000;

/** id -> { port, filename, size, at } for downloads registered by the page. */
const pending = new Map();

self.addEventListener("install", () => {
  // Take over on the next navigation instead of waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const message = event.data;
  // Only "register" is handled. Everything else, notably the keep-alive "ping",
  // returns here cheaply: it is sent with worker.postMessage because only that
  // resets the worker's idle timer.
  if (!message || message.type !== "register") return;
  const port = event.ports && event.ports[0];
  if (!port || typeof message.id !== "string" || !UUID.test(message.id)) return;

  const now = Date.now();
  for (const [id, entry] of pending) {
    if (now - entry.at >= ID_TTL_MS) pending.delete(id);
  }
  pending.set(message.id, {
    port,
    filename: typeof message.filename === "string" ? message.filename : "download",
    size: typeof message.size === "number" ? message.size : undefined,
    at: now,
  });
  port.postMessage({ type: "registered" });
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const prefix = new URL(DOWNLOAD_DIR, self.registration.scope).pathname;
  if (!url.pathname.startsWith(prefix)) return;

  // One-shot: the entry is gone even if the response fails midway.
  const id = url.pathname.slice(prefix.length);
  const now = Date.now();
  const entry = pending.get(id);
  pending.delete(id);
  if (!entry || now - entry.at >= ID_TTL_MS) {
    event.respondWith(notFound());
    return;
  }
  // Build the response inside respondWith's try/catch: a header failure (for
  // example a filename encodeURIComponent rejects) must not let the navigation
  // fall through to the network.
  try {
    event.respondWith(downloadResponse(entry));
  } catch {
    event.respondWith(serverError());
  }
});

function notFound() {
  return new Response("Unknown download id", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function serverError() {
  return new Response("Download could not be prepared", {
    status: 500,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function downloadResponse({ port, filename, size }) {
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition(filename),
    "Cache-Control": "no-store",
  });
  // Only a page-known exact length may be announced; a wrong Content-Length
  // truncates or fails the download, so oversize payloads stay length-less.
  if (size !== undefined) headers.set("Content-Length", String(size));

  const inbox = [];
  let waiting = null;
  let closed = false;

  port.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type === "ping") return;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(message);
    } else {
      inbox.push(message);
    }
  });
  port.start();

  function next() {
    if (inbox.length > 0) return Promise.resolve(inbox.shift());
    const reply = new Promise((resolve) => {
      waiting = resolve;
    });
    port.postMessage({ type: "pull" });
    return reply;
  }

  function close() {
    if (closed) return;
    closed = true;
    try {
      port.close();
    } catch {
      // Already detached.
    }
  }

  const body = new ReadableStream({
    async pull(controller) {
      const message = await next();
      if (message.type === "chunk" && message.data instanceof ArrayBuffer) {
        controller.enqueue(new Uint8Array(message.data));
        return;
      }
      if (message.type === "done") {
        controller.close();
        close();
        return;
      }
      controller.error(new Error("The decrypted stream did not complete."));
      close();
    },
    cancel() {
      // Browser-side cancellation (user, disk error, page gone): let the page
      // stop decrypting and report "cancelled".
      try {
        port.postMessage({ type: "cancel" });
      } catch {
        // Port already closed.
      }
      close();
    },
  });

  return new Response(body, { headers });
}

/**
 * `filename="fallback"; filename*=UTF-8''...`. The fallback stays ASCII so old
 * clients still get a usable file; the RFC 5987 form keeps the real name.
 */
function contentDisposition(filename) {
  // encodeURIComponent throws on a lone surrogate; normalize first.
  const wellFormed =
    typeof filename.toWellFormed === "function" ? filename.toWellFormed() : filename;
  const fallback = wellFormed.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(wellFormed).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
