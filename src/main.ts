import { resolveMaxBufferBytes } from "./core/config.ts";
import { bytesToStream, joinStream, loadUpTo } from "./core/buffer.ts";
import { sniffContentType } from "./core/detect.ts";
import { isAbortError } from "./core/errors.ts";
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
import {
  parseSaverOverride,
  pickSaver,
  SaverUnavailableError,
} from "./ui/savers/index.ts";

const maxBufferBytes = resolveMaxBufferBytes(import.meta.env.VITE_MAX_BUFFER_BYTES);

/**
 * Test hook, not product behavior: `?saver=fsa|sw|anchor` forces a download
 * destination so the service-worker path is exercisable in Chromium. Read from
 * the query string (never the fragment, which stays secret). See README.
 */
const saverOverride = parseSaverOverride(
  new URLSearchParams(window.location.search).get("saver")
);

/** Transient resources deliberately kept out of AppState. */
let state: AppState = { phase: "idle" };
let loaded: Loaded | null = null;
let controller: AbortController | null = null;
let saveController: AbortController | null = null;
let lastWarning: ReviewWarning | undefined;
let runToken = 0;

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
  saveController?.abort();
  saveController = null;
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
    if (isAbortError(error)) {
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

function showCannotStream(): void {
  clearError();
  showErrorMessage(
    `This file is larger than ${formatBytes(maxBufferBytes)} and this browser cannot stream it to disk. Use a Chromium-based browser to save large files.`
  );
}

function save(): void {
  if (state.phase !== "review") return;

  const review = state.review;
  const current = loaded;
  if (!current) return;

  const saver = pickSaver(review, saverOverride);
  if (!saver) {
    showCannotStream();
    return;
  }

  // The picker must be opened synchronously from this click handler, so start
  // the save before rendering the "saving" state. The stream itself is created
  // only after the saver has a destination, so cancelling the picker leaves the
  // in-flight response reusable.
  const source = () =>
    current.kind === "complete"
      ? bytesToStream(current.bytes)
      : joinStream(current.prefix, current.rest);
  saveController = new AbortController();
  const promise = saver.save(source, review.filename, saveController.signal);
  setState({ phase: "saving", review });

  promise
    .then((outcome) => {
      if (state.phase !== "saving") return;
      saveController = null;
      if (outcome === "cancelled") {
        setState({ phase: "review", review });
        return;
      }
      loaded = null;
      controller = null;
      setState({ phase: "saved", review });
    })
    .catch((error: unknown) => {
      if (state.phase !== "saving") return;
      saveController = null;
      if (error instanceof SaverUnavailableError) {
        // Registration failed before the source was consumed, so keep the
        // review usable and leave `loaded` alone (like the no-saver path).
        setState({ phase: "review", review });
        showCannotStream();
        return;
      }
      if (isAbortError(error)) {
        // A complete payload can be saved again; an oversize one had its
        // remaining stream consumed, so start over from the form.
        if (loaded?.kind === "complete") {
          setState({ phase: "review", review });
          return;
        }
        release();
        setState({ phase: "idle", warning: lastWarning });
        return;
      }
      release();
      setState({
        phase: "idle",
        error: asAppError(error, { kind: "interrupted" }),
        warning: lastWarning,
      });
    });
}

function cancelSave(): void {
  if (state.phase !== "saving") return;
  saveController?.abort();
}

const handlers: UiHandlers = {
  onCancel: cancel,
  onCancelSave: cancelSave,
  onView: view,
  onSave: save,
  onBack: backToStart,
  onToggleScripts: toggleScripts,
  onCloseViewer: closeViewer,
};

/** Reads a fragment, always strips it, and prefills the form when idle. */
function applyFragment(): void {
  const hash = window.location.hash;
  const params = parseFragment(hash);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  if (state.phase !== "idle" || hash === "") return;
  prefillForm(params);
}

function main(): void {
  bindForm({ onSubmit: (request) => void run(request) });

  // The fragment is a prefill convenience only; never auto-start, and always
  // strip it from the address bar immediately after reading it.
  applyFragment();
  setState({ phase: "idle" });
  window.addEventListener("hashchange", applyFragment);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
