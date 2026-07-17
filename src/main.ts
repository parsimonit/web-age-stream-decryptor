import type { DecryptRequest, DecryptResult } from "./core/types.ts";
import { fetchAndDecrypt } from "./core/decrypt.ts";
import { detectContentType, extractFilename } from "./core/detect.ts";
import { parseFragment, toDecryptRequest } from "./core/fragment.ts";
import { bindForm, setFormState, hideForm, showForm, prefillForm } from "./ui/form.ts";
import { renderResult, clearStatusArea } from "./ui/renderer.ts";
import { showError, clearError } from "./ui/error.ts";

/**
 * Main entry point - handles fragment-driven auto-decryption or shows form
 */
function main() {
  bindForm({
    onSubmit: handleDecrypt,
    onReset: handleReset,
  });

  // Parse fragment for auto-decrypt and partial-prefill handling
  const fragmentParams = parseFragment(window.location.hash);
  const fragmentRequest = toDecryptRequest(fragmentParams);

  if (fragmentRequest) {
    // Auto-decryption: clear passphrase from address bar immediately
    history.replaceState(null, "", location.pathname + location.search);

    // Hide form and start decryption
    hideForm();
    clearError();
    setFormState("loading");

    // Run decryption asynchronously
    handleFragmentDecrypt(fragmentRequest);
  } else {
    // No complete fragment: show form for manual entry/prefill
    showForm();
    prefillForm(fragmentParams);
  }
}

/**
 * Handle auto-decryption from fragment parameters
 */
async function handleFragmentDecrypt(req: DecryptRequest): Promise<void> {
  try {
    // Core decryption pipeline
    const bytes = await fetchAndDecrypt(req.fileUrl, req.passphrase);

    // Detect content type and extract filename
    const contentType = detectContentType(bytes);
    const filename = extractFilename(req.fileUrl);

    const result: DecryptResult = {
      bytes,
      contentType,
      filename,
    };

    // Success: render result
    setFormState("idle");
    renderResult(result, req.forceDownload);
  } catch (error) {
    // On error, show the error and re-display the form for manual retry
    const appError = error as import("./core/types.ts").AppError;
    setFormState("idle");
    showError(appError);
    showForm();
    prefillForm(req);
  }
}

/**
 * Handle decrypt button click
 */
async function handleDecrypt(req: DecryptRequest): Promise<void> {
  // Clear previous results and errors
  clearStatusArea();
  clearError();

  // Transition to loading state
  setFormState("loading");

  try {
    // Core decryption pipeline
    const bytes = await fetchAndDecrypt(req.fileUrl, req.passphrase);

    // Detect content type and extract filename
    const contentType = detectContentType(bytes);
    const filename = extractFilename(req.fileUrl);

    const result: DecryptResult = {
      bytes,
      contentType,
      filename,
    };

    // Transition to success state
    setFormState("idle");
    renderResult(result, req.forceDownload);
  } catch (error) {
    // All errors from fetchAndDecrypt are AppError
    const appError = error as import("./core/types.ts").AppError;

    // Transition to error state
    setFormState("idle");
    showError(appError);
  }
}

/**
 * Handle reset (return to idle state)
 */
function handleReset(): void {
  setFormState("idle");
  clearStatusArea();
  clearError();
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
