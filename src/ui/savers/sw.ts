import { isAbortError } from "../../core/errors.ts";
import type { Saver } from "./types.ts";

/** Must match the prefix answered by public/sw.js. */
const DOWNLOAD_DIR = "__download__/";
/** Safari terminates idle service workers; the page keeps this one awake. */
const PING_INTERVAL_MS = 10_000;
/**
 * How long the hidden iframe stays after the save settles. Removing it aborts
 * its navigation, so the browser needs time to finish writing the response.
 */
const FRAME_LIFETIME_MS = 10_000;
/** Let the last posted message leave the port before closing it. */
const PORT_CLOSE_DELAY_MS = 1_000;

interface SwReply {
  type?: string;
  data?: ArrayBuffer;
}

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

/** Registration needs a secure context; anything else keeps the old fallback. */
export function isSwSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator
  );
}

async function register(): Promise<ServiceWorkerRegistration> {
  const container = navigator.serviceWorker;
  const base = import.meta.env.BASE_URL;
  // Registered lazily from the Save handler, never at page load: a visitor who
  // only views content never installs a worker.
  const registration = await container.register(`${base}sw.js`, { scope: base });
  const ready = registration.active ? registration : await container.ready;
  if (!ready.active) throw new Error("The download service worker is not active.");
  return ready;
}

function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  if (!registrationPromise) {
    registrationPromise = register().catch((error: unknown) => {
      registrationPromise = null;
      throw error;
    });
  }
  return registrationPromise;
}

/** Hidden iframe navigation is the download trigger StreamSaver uses too. */
function triggerDownload(id: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.src = `${import.meta.env.BASE_URL}${DOWNLOAD_DIR}${id}`;
  document.body.append(frame);
  return frame;
}

function abortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason !== undefined
    ? signal.reason
    : new DOMException("The save was cancelled.", "AbortError");
}

/**
 * The user cancelled in the browser's download UI. The source is already
 * (partly) consumed, so this is an abort rather than a picker-style
 * "cancelled": the caller decides whether a retry is possible.
 */
function browserCancelAbort(reader: ReadableStreamDefaultReader<Uint8Array>): unknown {
  void reader.cancel("download cancelled").catch(() => undefined);
  return abortReason(undefined);
}

function transferable(bytes: Uint8Array): ArrayBuffer {
  const buffer: ArrayBufferLike = bytes.buffer;
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength &&
    buffer instanceof ArrayBuffer
  ) {
    return buffer;
  }
  return bytes.slice().buffer;
}

/**
 * Streams the decrypted bytes into a browser download via public/sw.js.
 *
 * The promise settles when the service worker has been handed the whole stream
 * (or the source fails). The browser's download manager owns the file from
 * there: a failed or cancelled download can leave a partial file on disk, and
 * the page cannot remove it.
 *
 * Nothing here opens a picker, so no user activation is needed for the download
 * itself; registration and the triggering navigation still run inside the Save
 * click flow.
 */
export const swSaver: Saver = {
  id: "sw",
  canSave(): boolean {
    return isSwSupported();
  },
  async save(source, filename, signal) {
    if (signal?.aborted) throw abortReason(signal);

    const id = crypto.randomUUID();
    const channel = new MessageChannel();
    const port = channel.port1;

    let ack: (() => void) | null = null;
    let pullWaiter: (() => void) | null = null;
    let interruptWaiter: (() => void) | null = null;
    let pulls = 0;
    let aborted = false;
    let browserCancelled = false;

    // Resolves on user abort or browser cancel so the pump never stays blocked
    // inside a read of the (single, already in-flight) response stream.
    const interrupt = new Promise<"interrupt">((resolve) => {
      interruptWaiter = () => resolve("interrupt");
    });

    const wake = (waiter: (() => void) | null) => waiter?.();
    const wakeAck = () => {
      wake(ack);
      ack = null;
    };
    const wakePull = () => {
      wake(pullWaiter);
      pullWaiter = null;
    };
    const wakeInterrupt = () => {
      wake(interruptWaiter);
      interruptWaiter = null;
    };

    port.onmessage = (event: MessageEvent<SwReply>) => {
      switch (event.data?.type) {
        case "registered":
          wakeAck();
          break;
        case "pull":
          pulls += 1;
          wakePull();
          break;
        case "cancel":
          browserCancelled = true;
          wakeInterrupt();
          break;
      }
    };
    port.start();

    const onAbort = () => {
      aborted = true;
      wakeAck();
      wakeInterrupt();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let ping: number | undefined;
    let frame: HTMLIFrameElement | null = null;

    try {
      const registration = await ensureRegistration();
      const worker = registration.active;
      if (!worker) throw new Error("The download service worker is not active.");
      if (aborted) throw abortReason(signal);

      reader = source().getReader();
      ping = window.setInterval(
        () => port.postMessage({ type: "ping" }),
        PING_INTERVAL_MS
      );

      // The worker must know the id before the navigation reaches it.
      const registered = new Promise<void>((resolve) => {
        ack = resolve;
      });
      worker.postMessage({ type: "register", id, filename, port: channel.port2 }, [
        channel.port2,
      ]);
      await Promise.race([registered, interrupt]);
      if (aborted) throw abortReason(signal);

      frame = triggerDownload(id);

      for (;;) {
        if (aborted) throw abortReason(signal);
        if (browserCancelled) throw browserCancelAbort(reader);

        if (pulls > 0) pulls -= 1;
        else
          await Promise.race([
            new Promise<void>((resolve) => {
              pullWaiter = resolve;
            }),
            interrupt,
          ]);
        if (aborted) throw abortReason(signal);
        if (browserCancelled) throw browserCancelAbort(reader);

        const next = await Promise.race([reader.read(), interrupt]);
        if (next === "interrupt") continue;
        if (next.done) {
          // Final state is the download manager's; "saved" means every byte was
          // handed over, not that the browser finished flushing to disk.
          port.postMessage({ type: "done" });
          return "saved";
        }
        const buffer = transferable(next.value);
        port.postMessage({ type: "chunk", data: buffer }, [buffer]);
      }
    } catch (error) {
      if (aborted || isAbortError(error)) {
        port.postMessage({ type: "abort" });
        if (reader) void reader.cancel("download aborted").catch(() => undefined);
        throw isAbortError(error) ? error : abortReason(signal);
      }
      port.postMessage({ type: "error" });
      throw error;
    } finally {
      if (ping !== undefined) window.clearInterval(ping);
      signal?.removeEventListener("abort", onAbort);
      if (frame) window.setTimeout(() => frame?.remove(), FRAME_LIFETIME_MS);
      window.setTimeout(() => port.close(), PORT_CLOSE_DELAY_MS);
    }
  },
};
