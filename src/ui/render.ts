import type { AppState } from "../core/types.ts";
import { clearError, showError } from "./error.ts";
import { focusFileUrl, setFormVisible, setFormWarning } from "./form.ts";
import { renderReview } from "./review.ts";
import { clearStatus, showStatus } from "./status.ts";
import { hideViewer, showViewer } from "./viewer.ts";

export interface UiHandlers {
  onCancel: () => void;
  onView: () => void;
  onSave: () => void;
  onBack: () => void;
  onToggleScripts: () => void;
  onCloseViewer: () => void;
}

export interface RenderOptions {
  cap: number;
  viewerBytes?: Uint8Array;
  handlers: UiHandlers;
}

function element(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

let lastKey = "";

/** Single DOM projection of AppState; main.ts owns every transition. */
export function render(state: AppState, options: RenderOptions): void {
  const form = element("decrypt-form");
  const reviewPanel = element("review-panel");
  const viewerPanel = element("viewer-panel");
  const statusArea = element("status-area");
  const key =
    state.phase === "viewing" ? `viewing:${String(state.scripts)}` : state.phase;
  const previousKey = lastKey;
  const phaseChanged = key !== previousKey;
  lastKey = key;

  const { handlers } = options;

  switch (state.phase) {
    case "idle": {
      hideViewer(viewerPanel);
      reviewPanel.hidden = true;
      reviewPanel.replaceChildren();
      clearStatus(statusArea);
      form.hidden = false;

      if (state.error) showError(state.error);
      else clearError();

      setFormWarning(state.warning);
      if (phaseChanged && previousKey !== "") focusFileUrl();
      break;
    }

    case "loading": {
      hideViewer(viewerPanel);
      reviewPanel.hidden = true;
      reviewPanel.replaceChildren();
      setFormVisible(false);
      clearError();
      setFormWarning(undefined);
      showStatus(statusArea, {
        text: `Fetching ${state.host}…`,
        spinner: true,
        cancel: handlers.onCancel,
      });
      if (phaseChanged) element("cancel-button")?.focus();
      break;
    }

    case "review": {
      hideViewer(viewerPanel);
      clearStatus(statusArea);
      setFormVisible(false);
      clearError();
      setFormWarning(undefined);
      renderReview(reviewPanel, state.review, {
        cap: options.cap,
        mode: "review",
        onView: handlers.onView,
        onSave: handlers.onSave,
        onCancel: handlers.onCancel,
        onBack: handlers.onBack,
      });
      if (phaseChanged) element("review-heading").focus();
      break;
    }

    case "saving": {
      hideViewer(viewerPanel);
      clearStatus(statusArea);
      setFormVisible(false);
      clearError();
      setFormWarning(undefined);
      renderReview(reviewPanel, state.review, {
        cap: options.cap,
        mode: "saving",
        onView: handlers.onView,
        onSave: handlers.onSave,
        onCancel: handlers.onCancel,
        onBack: handlers.onBack,
      });
      break;
    }

    case "saved": {
      hideViewer(viewerPanel);
      clearStatus(statusArea);
      setFormVisible(false);
      clearError();
      setFormWarning(undefined);
      renderReview(reviewPanel, state.review, {
        cap: options.cap,
        mode: "saved",
        onView: handlers.onView,
        onSave: handlers.onSave,
        onCancel: handlers.onCancel,
        onBack: handlers.onBack,
      });
      if (phaseChanged) element("back-button").focus();
      break;
    }

    case "viewing": {
      reviewPanel.hidden = true;
      reviewPanel.replaceChildren();
      clearStatus(statusArea);
      setFormVisible(false);
      clearError();
      setFormWarning(undefined);

      if (options.viewerBytes) {
        showViewer(viewerPanel, state.review, options.viewerBytes, state.scripts, {
          onToggleScripts: handlers.onToggleScripts,
          onClose: handlers.onCloseViewer,
        });
      } else {
        hideViewer(viewerPanel);
        showStatus(statusArea, {
          text: "The decrypted content is no longer available.",
        });
      }
      break;
    }
  }
}
