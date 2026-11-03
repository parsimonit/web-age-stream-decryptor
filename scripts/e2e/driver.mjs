/**
 * The only module in the E2E suite that knows about agent-browser.
 *
 * Scenarios use this small API so a future Playwright driver can replace it
 * without touching scripts/e2e/scenarios.mjs.
 */
import { execFile } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_BIN = join(ROOT, "node_modules", ".bin", "agent-browser");
const CALL_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 32 * 1024 * 1024;

const CSP_INIT_SCRIPT = `
window.__cspViolations = [];
document.addEventListener("securitypolicyviolation", (event) => {
  window.__cspViolations.push({
    directive: event.violatedDirective,
    blocked: event.blockedURI,
    source: event.sourceFile || ""
  });
});
`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(stdout) {
  const text = stdout.trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("agent-browser returned no JSON");
  return JSON.parse(text.slice(start));
}

function selectorForTestId(testId) {
  return `[data-testid="${testId}"]`;
}

export class AgentBrowserDriver {
  constructor({ session, bin = DEFAULT_BIN } = {}) {
    if (!session) throw new Error("driver needs an isolated session name");
    this.session = session;
    this.bin = bin;
    this.opened = false;
    this.closed = false;
    this.initScriptPath = join(tmpdir(), `age-e2e-csp-${process.pid}.js`);
    writeFileSync(this.initScriptPath, CSP_INIT_SCRIPT, "utf8");
  }

  async run(args) {
    const full = ["--session", this.session, "--json", ...args];
    try {
      const { stdout } = await execFileAsync(this.bin, full, {
        maxBuffer: MAX_BUFFER,
        timeout: CALL_TIMEOUT_MS,
      });
      const parsed = parseJson(stdout);
      if (!parsed.success) {
        throw new Error(`agent-browser ${args[0]}: ${parsed.error ?? "failed"}`);
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("agent-browser ")) {
        throw error;
      }
      const stdout = typeof error.stdout === "string" ? error.stdout : "";
      let parsed = null;
      try {
        parsed = parseJson(stdout);
      } catch {
        // stdout had no JSON object; fall back to stderr below.
      }
      if (parsed?.error) {
        throw new Error(`agent-browser ${args[0]}: ${parsed.error}`, { cause: error });
      }
      const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
      throw new Error(`agent-browser ${args[0]} failed: ${stderr || error.message}`, {
        cause: error,
      });
    }
  }

  async open(url) {
    // about:blank first guarantees a full document load even when only the
    // fragment changes, so every scenario starts from fresh page state.
    const blank = ["open"];
    if (!this.opened) {
      blank.push("--init-script", this.initScriptPath);
      this.opened = true;
    }
    blank.push("about:blank");
    await this.run(blank);
    await this.run(["open", url]);
    if (!this.viewportSet) {
      this.viewportSet = true;
      await this.run(["set", "viewport", "1280", "900"]);
    }
  }

  async click(testId) {
    await this.run(["find", "testid", testId, "click"]);
  }

  async fill(testId, value) {
    await this.run(["find", "testid", testId, "fill", value]);
  }

  async text(testId) {
    return this.eval(
      `document.querySelector(${JSON.stringify(selectorForTestId(testId))})?.textContent ?? null`
    );
  }

  async value(testId) {
    return this.eval(
      `document.querySelector(${JSON.stringify(selectorForTestId(testId))})?.value ?? null`
    );
  }

  /** Changes only the fragment, without a full navigation. */
  async setHash(hash) {
    await this.eval(`location.hash = ${JSON.stringify(hash)}`);
  }

  async attr(testId, name) {
    return this.eval(
      `document.querySelector(${JSON.stringify(selectorForTestId(testId))})?.getAttribute(${JSON.stringify(name)}) ?? null`
    );
  }

  async exists(testId) {
    return this.eval(
      `!!document.querySelector(${JSON.stringify(selectorForTestId(testId))})`
    );
  }

  async url() {
    const data = await this.run(["get", "url"]);
    return data.url;
  }

  async eval(js) {
    const data = await this.run([
      "eval",
      "-b",
      Buffer.from(js, "utf8").toString("base64"),
    ]);
    return data.result;
  }

  /** Waits for a JS expression (or a CSS selector) to become truthy. */
  async waitFor(expression, timeout = 10_000) {
    const selector = /^[.#[]/.test(expression);
    const predicate = selector
      ? `!!document.querySelector(${JSON.stringify(expression)})`
      : expression;
    const deadline = Date.now() + timeout;
    let lastError;
    for (;;) {
      try {
        if (await this.eval(predicate)) return;
        lastError = undefined;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() >= deadline) {
        const suffix = lastError ? ` (last error: ${lastError.message})` : "";
        throw new Error(
          `Timed out after ${timeout}ms waiting for ${expression}${suffix}`
        );
      }
      await delay(100);
    }
  }

  async consoleMessages() {
    const data = await this.run(["console"]);
    return (data.messages ?? []).map((message) => ({
      type: message.type,
      text: message.text,
    }));
  }

  async clearConsole() {
    await this.run(["console", "--clear"]);
  }

  async pageErrors() {
    const data = await this.run(["errors"]);
    return (data.errors ?? []).map((error) => ({
      type: error.type,
      text: error.text,
    }));
  }

  async clearPageErrors() {
    await this.run(["errors", "--clear"]);
  }

  async cspViolations() {
    return this.eval("window.__cspViolations ?? []");
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.run(["close"]);
    } catch {
      // Teardown is best-effort; a crashed browser is already gone.
    }
    try {
      unlinkSync(this.initScriptPath);
    } catch {
      // Already removed.
    }
  }
}
