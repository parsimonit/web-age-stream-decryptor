import type { Review } from "../core/types.ts";

export interface ViewerHandlers {
  onToggleScripts: () => void;
  onClose: () => void;
}

let currentUrl: string | null = null;

function revoke(): void {
  if (currentUrl !== null) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

function toBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

/** Creates a fresh blob URL, revoking the previous one. */
function blobUrl(review: Review, bytes: Uint8Array): string {
  revoke();
  const blob = new Blob([toBlobPart(bytes)], { type: review.contentType.mimeType });
  currentUrl = URL.createObjectURL(blob);
  return currentUrl;
}

export function hideViewer(container: HTMLElement): void {
  revoke();
  container.replaceChildren();
  container.hidden = true;
}

/** Renders decrypted content in an isolated iframe. */
export function showViewer(
  container: HTMLElement,
  review: Review,
  bytes: Uint8Array,
  scripts: boolean,
  handlers: ViewerHandlers
): void {
  const url = blobUrl(review, bytes);
  const kind = review.contentType.kind;

  container.replaceChildren();
  container.hidden = false;

  const heading = document.createElement("h2");
  heading.id = "viewer-heading";
  heading.tabIndex = -1;
  heading.textContent = `Viewing ${review.filename}`;
  container.append(heading);

  const toolbar = document.createElement("div");
  toolbar.className = "button-row viewer-toolbar";

  if (kind === "html" || kind === "svg") {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.testid = "run-scripts-button";
    toggle.className = scripts ? "button-danger" : "button-secondary";
    toggle.textContent = scripts ? "Disable scripts" : "Run scripts";
    toggle.setAttribute("aria-pressed", String(scripts));
    toggle.addEventListener("click", handlers.onToggleScripts);
    toolbar.append(toggle);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.id = "viewer-close-button";
  close.dataset.testid = "viewer-close-button";
  close.className = "button-secondary";
  close.textContent = "Close";
  close.addEventListener("click", handlers.onClose);
  toolbar.append(close);
  container.append(toolbar);

  if (kind === "html" || kind === "svg") {
    const note = document.createElement("p");
    note.className = scripts ? "viewer-note danger" : "viewer-note";
    note.textContent = scripts
      ? "Scripts are enabled. Only continue if you trust this file completely."
      : "Scripts are disabled. Decrypted content runs in a sandbox and cannot access this page.";
    note.dataset.testid = "viewer-note";
    container.append(note);
  }

  const iframe = document.createElement("iframe");
  iframe.dataset.testid = "viewer-iframe";
  iframe.className = "viewer-frame";
  iframe.title = `Decrypted ${kind === "pdf" ? "PDF" : "content"}: ${review.filename}`;
  iframe.referrerPolicy = "no-referrer";
  iframe.src = url;
  if (kind === "html" || kind === "svg") {
    // Never allow-same-origin: the decrypted document must stay opaque.
    iframe.setAttribute("sandbox", scripts ? "allow-scripts" : "");
  }
  container.append(iframe);

  close.focus();
}
