import { resolveMaxBufferBytes } from "./core/config.ts";
import { bytesToStream, joinStream, loadUpTo } from "./core/buffer.ts";
import { sniffContentType } from "./core/detect.ts";
import { filenameFor } from "./core/filename.ts";
import { parseFragment } from "./core/fragment.ts";
import { buildReview } from "./core/review.ts";
import { openDecryptedStream } from "./core/stream.ts";
import type {
  AppError,
  AppState,
  DecryptRequest,
  Loaded,
  ReviewWarning,
} from "./core/types.ts";
import { checkUrl } from "./core/url.ts";
import { clearError, showErrorMessage } from "./ui/error.ts";
import { bindForm, prefillForm } from "./ui/form.ts";
import { formatBytes } from "./ui/format.ts";
import { render, type UiHandlers } from "./ui/render.ts";
import { pickSaver } from "./ui/savers/index.ts";

const maxBufferBytes = resolveMaxBufferBytes(import.meta.env.VITE_MAX_BUFFER_BYTES);

/** Transient resources deliberately kept out of AppState. */
let state: AppState = { phase: "idle" };
let loaded: Loaded | null = null;
let controller: AbortController | null = null;
let lastWarning: ReviewWarning | undefined;
let runToken = 0;

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError")
  );
}

const ERROR_KINDS = new Set([
  "network",
  "fetch",
  "mixed-content",
  "format",
  "decrypt",
  "interrupted",
]);

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof (error as { kind?: unknown }).kind === "string" &&
    ERROR_KINDS.has((error as { kind: string }).kind)
  );
}

function asAppError(error: unknown, fallback: AppError): AppError {
  return isAppError(error) ? error : fallback;
}

function viewerBytes(): Uint8Array | undefined {
  return state.phase === "viewing" && loaded?.kind === "complete"
    ? loaded.bytes
    : undefined;
}

function setState(next: AppState): void {
  state = next;
  render(state, { cap: maxBufferBytes, viewerBytes: viewerBytes(), handlers });
}

function release(): void {
  controller?.abort();
  controller = null;
  loaded = null;
}

/** Single execution path: preflight -> fetch/decrypt -> bounded read -> review. */
async function run(request: DecryptRequest): Promise<void> {
  runToken += 1;
  const token = runToken;
  release();

  const checked = checkUrl(request.fileUrl, window.location.protocol);
  if (!checked.ok) {
    setState({ phase: "idle", error: checked.error });
    return;
  }

  lastWarning = checked.warning;
  controller = new AbortController();
  setState({ phase: "loading", host: checked.host });

  try {
    const opened = await openDecryptedStream(
      request.fileUrl,
      request.passphrase,
      controller.signal
    );
    if (token !== runToken) return;

    const result = await loadUpTo(opened.stream, maxBufferBytes);
    if (token !== runToken) {
      if (result.kind === "oversize") await result.rest.cancel().catch(() => undefined);
      return;
    }
    loaded = result;

    const head =
      result.kind === "complete"
        ? result.bytes
        : (result.prefix[0] ?? new Uint8Array());
    const contentType = sniffContentType(head);
    const file = filenameFor(request.fileUrl, opened.meta.contentDisposition);

    const review = buildReview({
      fileUrl: request.fileUrl,
      urlWarning: checked.warning,
      contentType,
      filename: file,
      loaded: result,
      meta: opened.meta,
      saveOnly: request.saveOnly,
    });

    setState({ phase: "review", review });
  } catch (error) {
    if (token !== runToken) return;
    release();
    if (isAbort(error)) {
      setState({ phase: "idle", warning: lastWarning });
      return;
    }
    setState({
      phase: "idle",
      error: asAppError(error, { kind: "network" }),
      warning: lastWarning,
    });
  }
}

function cancel(): void {
  runToken += 1;
  release();
  setState({ phase: "idle", warning: lastWarning });
}

function view(): void {
  if (state.phase !== "review") return;
  if (loaded?.kind !== "complete") return;
  if (!state.review.actions.includes("view")) return;
  setState({ phase: "viewing", review: state.review, scripts: false });
}

function toggleScripts(): void {
  if (state.phase !== "viewing") return;
  setState({ ...state, scripts: !state.scripts });
}

function closeViewer(): void {
  release();
  setState({ phase: "idle", warning: lastWarning });
}

function backToStart(): void {
  release();
  setState({ phase: "idle", warning: lastWarning });
}

function save(): void {
  if (state.phase !== "review") return;

  const review = state.review;
  const current = loaded;
  if (!current) return;

  const saver = pickSaver(review);
  if (!saver) {
    clearError();
    showErrorMessage(
      `This file is larger than ${formatBytes(maxBufferBytes)} and this browser cannot stream it to disk. Use a Chromium-based browser to save large files.`
    );
    return;
  }

  // The picker must be opened synchronously from this click handler, so start
  // the save before rendering the "saving" state.
  const stream =
    current.kind === "complete"
      ? bytesToStream(current.bytes)
      : joinStream(current.prefix, current.rest);
  const promise = saver.save(stream, review.filename);
  setState({ phase: "saving", review });

  promise
    .then(() => {
      if (state.phase !== "saving") return;
      loaded = null;
      controller = null;
      setState({ phase: "saved", review });
    })
    .catch((error: unknown) => {
      if (state.phase !== "saving") return;
      release();
      if (isAbort(error)) {
        setState({ phase: "review", review });
        return;
      }
      setState({
        phase: "idle",
        error: asAppError(error, { kind: "interrupted" }),
        warning: lastWarning,
      });
    });
}

const handlers: UiHandlers = {
  onCancel: cancel,
  onView: view,
  onSave: save,
  onBack: backToStart,
  onToggleScripts: toggleScripts,
  onCloseViewer: closeViewer,
};

function main(): void {
  bindForm({ onSubmit: (request) => void run(request) });

  // The fragment is a prefill convenience only; never auto-start, and always
  // strip it from the address bar immediately after reading it.
  const params = parseFragment(window.location.hash);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  prefillForm(params);
  setState({ phase: "idle", prefill: params });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
