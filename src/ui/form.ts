import type { DecryptRequest, AppState, FragmentParams } from "../core/types.ts";

function buildFragmentUrl(req: DecryptRequest): string {
  const params = new URLSearchParams();
  params.set("u", req.fileUrl);
  params.set("pw", req.passphrase);
  if (req.forceDownload) {
    params.set("d", "1");
  }

  return `${location.origin}${location.pathname}#${params.toString()}`;
}

/**
 * Attaches submit handler and validation to the decryption form.
 * Calls onSubmit with validated inputs; calls onReset when user clears state.
 */
export function bindForm(opts: {
  onSubmit: (req: DecryptRequest) => void;
  onReset: () => void;
}): void {
  const form = document.getElementById("decrypt-form") as HTMLFormElement;
  const fileUrlInput = document.getElementById("file-url") as HTMLInputElement;
  const passphraseInput = document.getElementById("passphrase") as HTMLInputElement;
  const forceDownloadInput = document.getElementById(
    "force-download"
  ) as HTMLInputElement;
  const copyLinkButton = document.getElementById("copy-link-button") as HTMLButtonElement;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fileUrl = fileUrlInput.value.trim();
    const passphrase = passphraseInput.value;
    const forceDownload = forceDownloadInput.checked;

    // Validation: non-empty fields
    if (!fileUrl || !passphrase) {
      return; // HTML5 'required' should prevent this, but guard anyway
    }

    // Validation: must be a valid URL
    try {
      new URL(fileUrl);
    } catch {
      alert("Please enter a valid URL");
      return;
    }

    opts.onSubmit({ fileUrl, passphrase, forceDownload });
  });

  copyLinkButton.addEventListener("click", async () => {
    const fileUrl = fileUrlInput.value.trim();
    const passphrase = passphraseInput.value;
    const forceDownload = forceDownloadInput.checked;

    if (!fileUrl || !passphrase) {
      alert("Please enter both file URL and passphrase before copying a link.");
      return;
    }

    try {
      new URL(fileUrl);
    } catch {
      alert("Please enter a valid URL before copying a link.");
      return;
    }

    const link = buildFragmentUrl({ fileUrl, passphrase, forceDownload });

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(link);

      const originalText = copyLinkButton.textContent || "Copy Link";
      copyLinkButton.textContent = "Copied!";
      copyLinkButton.disabled = true;

      setTimeout(() => {
        copyLinkButton.textContent = originalText;
        copyLinkButton.disabled = false;
      }, 2000);
    } catch {
      alert(`Could not copy to clipboard. Copy this link manually:\n\n${link}`);
    }
  });

  // Optional: add reset button handler if needed
  // For now, user can reload page to reset
}

/**
 * Updates the form's interactive state based on the current AppState phase.
 */
export function setFormState(phase: AppState["phase"]): void {
  const decryptButton = document.getElementById("decrypt-button") as HTMLButtonElement;
  const copyLinkButton = document.getElementById("copy-link-button") as HTMLButtonElement;

  if (phase === "loading") {
    decryptButton.disabled = true;
    copyLinkButton.disabled = true;
    decryptButton.classList.add("loading");
  } else {
    decryptButton.disabled = false;
    copyLinkButton.disabled = false;
    decryptButton.classList.remove("loading");
  }
}

/**
 * Hides the decryption form from view.
 */
export function hideForm(): void {
  const form = document.querySelector("form")!;
  form.hidden = true;
}

/**
 * Shows the decryption form.
 */
export function showForm(): void {
  const form = document.querySelector("form")!;
  form.hidden = false;
}

/**
 * Prefills available values from fragment parameters.
 */
export function prefillForm(params: FragmentParams): void {
  const fileUrlInput = document.getElementById("file-url") as HTMLInputElement;
  const passphraseInput = document.getElementById("passphrase") as HTMLInputElement;
  const forceDownloadInput = document.getElementById(
    "force-download"
  ) as HTMLInputElement;

  fileUrlInput.value = params.fileUrl ?? "";
  passphraseInput.value = params.passphrase ?? "";
  forceDownloadInput.checked = params.forceDownload;
}
