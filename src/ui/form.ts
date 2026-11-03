import type { DecryptRequest, FragmentParams, ReviewWarning } from "../core/types.ts";
import { warningText } from "./warnings.ts";

export interface FormHandlers {
  onSubmit: (request: DecryptRequest) => void;
}

function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

/** Wires the form's submit handler and keeps the DOM free of business logic. */
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
}

/** Applies fragment values. Never auto-submits; the user still confirms. */
export function prefillForm(params: FragmentParams): void {
  input("file-url").value = params.fileUrl ?? "";
  input("passphrase").value = params.passphrase ?? "";
  input("save-only").checked = params.saveOnly;
}

export function setFormVisible(visible: boolean): void {
  const form = document.getElementById("decrypt-form") as HTMLFormElement;
  form.hidden = !visible;
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
