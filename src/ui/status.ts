export interface StatusOptions {
  text: string;
  spinner?: boolean;
  cancel?: () => void;
}

/** Renders the loading/saving line, optionally with a spinner and Cancel. */
export function showStatus(container: HTMLElement, options: StatusOptions): void {
  container.replaceChildren();
  container.hidden = false;

  const text = document.createElement("p");
  text.id = "status-text";
  text.dataset.testid = "status-text";
  text.className = "status-text";
  text.setAttribute("role", "status");

  if (options.spinner) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    text.append(spinner);
  }

  text.append(document.createTextNode(options.text));
  container.append(text);

  if (options.cancel) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.id = "cancel-button";
    cancel.dataset.testid = "cancel-button";
    cancel.className = "button-secondary";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", options.cancel);
    container.append(cancel);
  }
}

export function clearStatus(container: HTMLElement): void {
  container.replaceChildren();
  container.hidden = true;
}
