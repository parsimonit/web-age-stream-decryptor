import type { Review } from "../core/types.ts";
import { formatBytes } from "./format.ts";
import { warningText } from "./warnings.ts";

export interface ReviewHandlers {
  onView: () => void;
  onSave: () => void;
  onCancelSave: () => void;
  onCancel: () => void;
  onBack: () => void;
}

export interface ReviewOptions extends ReviewHandlers {
  cap: number;
  mode: "review" | "saving" | "saved";
}

function typeLabel(review: Review): string {
  switch (review.contentType.kind) {
    case "html":
      return "HTML";
    case "svg":
      return "SVG image";
    case "pdf":
      return "PDF";
    case "binary":
      return "Binary file";
  }
}

function detail(term: string, value: string, testId: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.dataset.testid = testId;
  dd.textContent = value;
  fragment.append(dt, dd);
  return fragment;
}

function button(
  label: string,
  testId: string,
  variant: "primary" | "secondary" | "danger",
  onClick: () => void
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.dataset.testid = testId;
  element.textContent = label;
  if (variant === "secondary") element.className = "button-secondary";
  if (variant === "danger") element.className = "button-danger";
  element.addEventListener("click", onClick);
  return element;
}

/** Renders the security gate: what will be viewed/saved, plus the next action. */
export function renderReview(
  container: HTMLElement,
  review: Review,
  options: ReviewOptions
): void {
  container.replaceChildren();
  container.hidden = false;

  const heading = document.createElement("h2");
  heading.id = "review-heading";
  heading.tabIndex = -1;
  heading.textContent = "Review before continuing";
  container.append(heading);

  const details = document.createElement("dl");
  details.className = "review-details";
  details.append(
    detail("Host", review.host, "review-host"),
    detail("File name", review.filename, "review-filename"),
    detail("Type", typeLabel(review), "review-type"),
    detail(
      "Size",
      review.size === undefined
        ? "Unknown"
        : `${formatBytes(review.size)}${review.oversize ? " (too large to view)" : ""}`,
      "review-size"
    )
  );
  container.append(details);

  const warnings = document.createElement("ul");
  warnings.className = "review-warnings";
  warnings.dataset.testid = "review-warnings";
  if (review.warnings.length === 0) {
    warnings.hidden = true;
  } else {
    for (const warning of review.warnings) {
      const item = document.createElement("li");
      item.textContent = warningText(warning);
      item.dataset.warning = warning;
      warnings.append(item);
    }
  }
  container.append(warnings);

  if (review.oversize) {
    const note = document.createElement("p");
    note.className = "review-note";
    note.dataset.testid = "review-oversize";
    note.textContent = `Large file (> ${formatBytes(options.cap)}): save only. Viewing is disabled to keep memory bounded.`;
    container.append(note);
  }

  if (options.mode === "saving") {
    const status = document.createElement("p");
    status.className = "status-text";
    status.dataset.testid = "status-text";
    status.setAttribute("role", "status");
    status.textContent = "Saving…";
    container.append(status);

    const actions = document.createElement("div");
    actions.className = "button-row review-actions";
    actions.append(
      button("Cancel", "save-cancel-button", "danger", options.onCancelSave)
    );
    container.append(actions);
    return;
  }

  if (options.mode === "saved") {
    const status = document.createElement("p");
    status.className = "status-text success";
    status.dataset.testid = "status-text";
    status.setAttribute("role", "status");
    status.textContent = "Saved.";
    container.append(status);

    const actions = document.createElement("div");
    actions.className = "button-row review-actions";
    actions.append(button("Back to start", "back-button", "primary", options.onBack));
    container.append(actions);
    return;
  }

  const actions = document.createElement("div");
  actions.className = "button-row review-actions";

  if (review.actions.includes("view")) {
    actions.append(button("View in browser", "view-button", "primary", options.onView));
  }
  if (review.actions.includes("save")) {
    actions.append(button("Save file", "save-button", "secondary", options.onSave));
  }
  actions.append(button("Cancel", "review-cancel-button", "danger", options.onCancel));
  container.append(actions);
}
