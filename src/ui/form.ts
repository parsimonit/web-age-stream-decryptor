import { buildFragment } from "../core/fragment.ts";
import type { DecryptRequest, FragmentParams, ReviewWarning } from "../core/types.ts";
import { checkUrl } from "../core/url.ts";
import { warningText } from "./warnings.ts";

export interface FormHandlers {
  onSubmit: (request: DecryptRequest) => void;
}

const COPY_LINK_LABEL = "Copy Link";
const COPIED_LABEL = "Copied!";
const COPIED_MS = 2000;

let copiedTimer: number | undefined;

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function button(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

function setCopyStatus(text: string): void {
  const status = document.getElementById("copy-link-status");
  if (status) status.textContent = text;
}

function clearFallback(): void {
  const fallback = input("copy-link-fallback");
  fallback.hidden = true;
  fallback.value = "";
}

/** Clears transient Copy Link state; the link itself is never retained. */
export function resetCopyLink(): void {
  if (copiedTimer !== undefined) {
    window.clearTimeout(copiedTimer);
    copiedTimer = undefined;
  }
  button("copy-link-button").textContent = COPY_LINK_LABEL;
  setCopyStatus("");
  clearFallback();
}

async function copyLink(): Promise<void> {
  const fileUrl = input("file-url").value.trim();
  const passphrase = input("passphrase").value;
  const saveOnly = input("save-only").checked;
  const copyButton = button("copy-link-button");

  if (
    fileUrl === "" ||
    passphrase === "" ||
    !checkUrl(fileUrl, window.location.protocol).ok
  ) {
    setCopyStatus("Enter a file URL and passphrase first.");
    return;
  }

  // Build from the current page only: the query string (e.g. ?saver=) is not
  // part of the link, and the result is never stored or put in the address bar.
  const link = `${window.location.origin}${window.location.pathname}#${buildFragment({
    fileUrl,
    passphrase,
    saveOnly,
  })}`;
  const fallback = input("copy-link-fallback");
  clearFallback();

  copyButton.disabled = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(link);
  } catch {
    fallback.value = link;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    setCopyStatus("Could not copy automatically. Copy the link below.");
    copyButton.disabled = false;
    return;
  }
  copyButton.disabled = false;

  copyButton.textContent = COPIED_LABEL;
  setCopyStatus("Copied!");
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copiedTimer = undefined;
    copyButton.textContent = COPY_LINK_LABEL;
  }, COPIED_MS);
}

/** Wires the form's submit and Copy Link handlers; no business logic lives here. */
export function bindForm(handlers: FormHandlers): void {
  const form = document.getElementById("decrypt-form") as HTMLFormElement;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const fileUrl = input("file-url").value.trim();
    const passphrase = input("passphrase").value;
    const saveOnly = input("save-only").checked;

    if (fileUrl === "" || passphrase === "") return;

    handlers.onSubmit({ fileUrl, passphrase, saveOnly });
  });

  button("copy-link-button").addEventListener("click", () => {
    void copyLink();
  });
}

/** Applies fragment values. Never auto-submits; the user still confirms. */
export function prefillForm(params: FragmentParams): void {
  input("file-url").value = params.fileUrl ?? "";
  input("passphrase").value = params.passphrase ?? "";
  input("save-only").checked = params.saveOnly;
  resetCopyLink();
}

export function setFormVisible(visible: boolean): void {
  const form = document.getElementById("decrypt-form") as HTMLFormElement;
  form.hidden = !visible;
}

/** Mirrors the Decrypt button's loading state onto the Copy Link button. */
export function setFormBusy(busy: boolean): void {
  button("decrypt-button").disabled = busy;
  button("copy-link-button").disabled = busy;
}

export function setFormWarning(warning: ReviewWarning | undefined): void {
  const element = document.getElementById("form-warning");
  if (!element) return;

  element.replaceChildren();
  if (warning === undefined) {
    element.hidden = true;
    return;
  }

  element.hidden = false;
  element.textContent = warningText(warning);
}

export function focusFileUrl(): void {
  input("file-url").focus();
}
