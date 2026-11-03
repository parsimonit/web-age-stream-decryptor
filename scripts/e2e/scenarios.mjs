/**
 * Browser E2E scenarios. Each entry is independent: run.mjs resets the fixture
 * server counters and navigates to a fresh page before calling it.
 *
 * Only the driver API is used here; scripts/e2e/driver.mjs is the sole
 * agent-browser-aware module.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DEFAULT_PASSPHRASE, SPACES_PASSPHRASE } from "./server.mjs";

const DEFAULT_PASS = DEFAULT_PASSPHRASE;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertIncludes(value, needle, label) {
  if (typeof value !== "string" || !value.includes(needle)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(needle)} in ${JSON.stringify(value)}`
    );
  }
}

function fragmentUrl(app, { u, pw, d }) {
  const params = new URLSearchParams();
  if (u !== undefined) params.set("u", u);
  if (pw !== undefined) params.set("pw", pw);
  if (d) params.set("d", "1");
  return `${app}#${params.toString()}`;
}

function fragmentHash(options) {
  return fragmentUrl("", options);
}

/** Test hook from README: force a download destination via the query string. */
function saverUrl(app, saver) {
  return `${app}?saver=${saver}`;
}

function requestCount(stats, pathname) {
  return stats.paths[pathname]?.requests ?? 0;
}

function waitForStats(server, predicate, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  return (async () => {
    for (;;) {
      const stats = server.stats();
      if (predicate(stats)) return stats;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out after ${timeout}ms waiting for fixture stats`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
}

async function waitForReview(driver, timeout = 30_000) {
  await driver.waitFor(
    "!document.querySelector('[data-testid=review-panel]').hidden",
    timeout
  );
}

async function waitForForm(driver, timeout = 10_000) {
  // The form has an id but no data-testid; ids are the stable hook here.
  await driver.waitFor("!document.querySelector('#decrypt-form').hidden", timeout);
}

async function waitForError(driver, timeout = 20_000) {
  await driver.waitFor(
    "document.querySelector('[data-testid=error-banner]')?.hidden === false",
    timeout
  );
  return driver.text("error-banner");
}

async function fillAndSubmit(driver, fileUrl, passphrase = DEFAULT_PASS) {
  await driver.fill("file-url", fileUrl);
  await driver.fill("passphrase", passphrase);
  await driver.click("decrypt-button");
}

async function expectConditionNever(driver, expression, timeout) {
  try {
    await driver.waitFor(expression, timeout);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Timed out after")) return;
    throw error;
  }
  throw new Error(`Condition should never become true: ${expression}`);
}

async function installSaverStub(driver) {
  await driver.eval(`(() => {
    window.__pickerCalls = 0;
    window.__savedFileNames = [];
    window.showSaveFilePicker = async ({ suggestedName } = {}) => {
      window.__pickerCalls += 1;
      window.__savedFileNames.push(suggestedName);
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle(suggestedName, { create: true });
    };
    return true;
  })()`);
}

async function opfsFileInfo(driver, name) {
  return driver.eval(`(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(${JSON.stringify(name)});
      const file = await handle.getFile();
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      let hex = "";
      for (const byte of new Uint8Array(digest)) {
        hex += byte.toString(16).padStart(2, "0");
      }
      return { size: file.size, sha256: hex };
    } catch {
      return null;
    }
  })()`);
}

async function waitForSaved(driver, timeout = 120_000) {
  await driver.waitFor(
    `document.querySelector('[data-testid=status-text]')?.textContent === "Saved."`,
    timeout
  );
}

async function installMessageCollector(driver) {
  await driver.eval(`(() => {
    window.__ageE2EMessages = [];
    window.addEventListener("message", (event) => {
      if (event.data && event.data.kind === "age-e2e-html") {
        window.__ageE2EMessages.push(event.data);
      }
    });
    return true;
  })()`);
}

export const scenarios = [
  {
    name: "a) form flow: review, no download before Save, Save -> saved",
    async run({ driver, server, app }) {
      const path = "/ok/hello.txt.age";
      await driver.open(app);
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver);

      assertEqual(await driver.text("review-host"), "127.0.0.1", "review host");
      assertEqual(await driver.text("review-filename"), "hello.txt", "filename");
      assertEqual(await driver.text("review-size"), "12 B", "size");
      assert(await driver.exists("save-button"), "Save should be offered");
      assert(!(await driver.exists("view-button")), "View should not be offered");
      assertEqual(
        requestCount(server.stats(), path),
        1,
        "one fixture request before Save"
      );

      await installSaverStub(driver);
      assertEqual(await driver.eval("window.__pickerCalls"), 0, "picker before click");
      assertEqual(
        await opfsFileInfo(driver, "hello.txt"),
        null,
        "no file before click"
      );

      await driver.click("save-button");
      await waitForSaved(driver);
      assertEqual(await driver.eval("window.__pickerCalls"), 1, "picker calls");
      const info = await opfsFileInfo(driver, "hello.txt");
      assert(info !== null, "saved file should exist");
      assertEqual(info.size, 12, "saved size");
      assertEqual(requestCount(server.stats(), path), 1, "one fixture request total");
    },
  },
  {
    name: "b) fragment prefills, strips hash, fetches only after Decrypt",
    async run({ driver, server, app }) {
      const path = "/ok/hello.txt.age";
      const target = server.url(path);

      await driver.open(fragmentUrl(app, { u: target, pw: DEFAULT_PASS }));
      await waitForForm(driver);

      assertEqual(await driver.value("file-url"), target, "prefilled URL");
      assertEqual(
        await driver.value("passphrase"),
        DEFAULT_PASS,
        "prefilled passphrase"
      );
      assertEqual(await driver.eval("location.hash"), "", "fragment stripped");
      assertEqual(requestCount(server.stats(), path), 0, "no fetch before Decrypt");

      await driver.click("decrypt-button");
      await waitForReview(driver);
      assertEqual(requestCount(server.stats(), path), 1, "one fetch after Decrypt");
    },
  },
  {
    name: "c) fragment passphrase keeps leading/trailing spaces",
    async run({ driver, server, app }) {
      const path = "/ok/with-spaces.age";
      const target = server.url(path);

      await driver.open(fragmentUrl(app, { u: target, pw: SPACES_PASSPHRASE }));
      await waitForForm(driver);
      assertEqual(
        await driver.value("passphrase"),
        SPACES_PASSPHRASE,
        "prefilled passphrase"
      );

      await driver.click("decrypt-button");
      await waitForReview(driver);
      assertEqual(await driver.text("review-filename"), "with-spaces", "filename");
      assertEqual(await driver.text("review-type"), "Binary file", "type");

      await installSaverStub(driver);
      await driver.click("save-button");
      await waitForSaved(driver);
      const info = await opfsFileInfo(driver, "with-spaces");
      assert(info !== null, "saved file should exist");
      assertEqual(info.size, 83, "decrypted size");
    },
  },
  {
    name: "d) HTML review: sandboxed view, scripts blocked/opt-in, no parent access",
    async run({ driver, server, app }) {
      await driver.open(app);
      await installMessageCollector(driver);
      await fillAndSubmit(driver, server.url("/html-script.age"));
      await waitForReview(driver);

      assertEqual(await driver.text("review-type"), "HTML", "type");
      assert(await driver.exists("view-button"), "View should be offered");
      assert(await driver.exists("save-button"), "Save should be offered");

      await driver.click("view-button");
      await driver.waitFor(
        "!!document.querySelector('[data-testid=viewer-iframe]')",
        10_000
      );

      const sandboxBefore = await driver.attr("viewer-iframe", "sandbox");
      assertEqual(sandboxBefore, "", "sandbox attribute without scripts");
      await expectConditionNever(driver, "window.__ageE2EMessages.length > 0", 750);
      assertEqual(
        await driver.eval("document.title"),
        "Age Browser Decryptor",
        "title"
      );

      await driver.click("run-scripts-button");
      await driver.waitFor("window.__ageE2EMessages.length > 0", 10_000);

      const sandboxAfter = await driver.attr("viewer-iframe", "sandbox");
      assertEqual(sandboxAfter, "allow-scripts", "sandbox attribute with scripts");
      assert(
        !sandboxAfter.split(/\s+/).includes("allow-same-origin"),
        "allow-same-origin must never be set"
      );

      const message = (await driver.eval("window.__ageE2EMessages[0]")) ?? {};
      assertEqual(message.ran, true, "script ran after opt-in");
      assertEqual(message.parentAccess, "no", "parent document must be inaccessible");
      assertEqual(message.body, "SCRIPT_RAN parent=no", "script-recorded body text");
      assertEqual(
        await driver.eval("document.title"),
        "Age Browser Decryptor",
        "parent title untouched"
      );
    },
  },
  {
    name: "e) PDF view; d=1 save-only hides View",
    async run({ driver, server, app }) {
      const target = server.url("/pdf.age");

      await driver.open(app);
      await fillAndSubmit(driver, target);
      await waitForReview(driver);
      assertEqual(await driver.text("review-type"), "PDF", "type");
      assert(await driver.exists("view-button"), "View should be offered");

      await driver.click("view-button");
      await driver.waitFor(
        "!!document.querySelector('[data-testid=viewer-iframe]')",
        10_000
      );
      assertEqual(
        await driver.eval(
          "document.querySelector('[data-testid=viewer-iframe]').hasAttribute('sandbox')"
        ),
        false,
        "PDF iframe has no sandbox attribute"
      );

      await driver.click("viewer-close-button");
      await waitForForm(driver);

      await driver.open(fragmentUrl(app, { u: target, pw: DEFAULT_PASS, d: true }));
      await waitForForm(driver);
      assertEqual(
        await driver.eval("document.querySelector('[data-testid=save-only]').checked"),
        true,
        "save-only prefilled"
      );
      await driver.click("decrypt-button");
      await waitForReview(driver);
      assert(!(await driver.exists("view-button")), "View hidden in save-only mode");
      assert(await driver.exists("save-button"), "Save still offered");
    },
  },
  {
    name: "f) errors: wrong passphrase, 404, no CORS, insecure http warning",
    async run({ driver, server, app }) {
      await driver.open(app);
      await fillAndSubmit(driver, server.url("/ok/hello.txt.age"), "wrong passphrase");
      assertIncludes(
        await waitForError(driver),
        "Decryption failed",
        "wrong passphrase"
      );

      await driver.open(app);
      await fillAndSubmit(driver, server.url("/ok/missing.age"));
      assertIncludes(await waitForError(driver), "HTTP 404", "404");

      await driver.open(app);
      await fillAndSubmit(driver, server.url("/nocors/hello.txt.age"));
      assertIncludes(await waitForError(driver), "Network error", "no CORS");

      // The preview is plain http on loopback, so the browser allows this fetch;
      // checkUrl warns first, then DNS resolution fails (network error).
      await driver.open(app);
      await fillAndSubmit(driver, "http://example.invalid/x.age");
      const error = await waitForError(driver);
      assertIncludes(error, "Network error", "non-loopback http");
      assertIncludes(await driver.text("form-warning"), "plain HTTP", "http warning");
      // Mixed content is not testable against a loopback preview and is skipped.
    },
  },
  {
    name: "g) tampered -> decrypt error, no partial file; dropped -> interrupted",
    async run({ driver, server, app }) {
      await driver.open(app);
      await installSaverStub(driver);
      await fillAndSubmit(driver, server.url("/tampered.age"));
      const tamperedError = await waitForError(driver);
      assert(
        /Decryption failed|interrupted/.test(tamperedError),
        `tampered error was ${JSON.stringify(tamperedError)}`
      );
      assertEqual(await driver.eval("window.__pickerCalls"), 0, "picker not called");
      assertEqual(await opfsFileInfo(driver, "tampered"), null, "no partial file");

      await driver.open(app);
      await fillAndSubmit(driver, server.url("/drop.age"));
      assertIncludes(await waitForError(driver), "interrupted", "dropped connection");
      assertEqual(
        requestCount(server.stats(), "/drop.age"),
        1,
        "one request for dropped payload"
      );
    },
  },
  {
    name: "h) oversize: save-only review, backpressure, one request, Cancel aborts",
    async run({ driver, server, app }) {
      const path = "/big.age";
      await driver.open(app);
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver, 60_000);

      const stats = server.stats();
      const entry = stats.paths[path];
      assert(entry !== undefined, "fixture server saw the request");
      assertEqual(entry.requests, 1, "one request for the whole flow");
      // The app reads ~10 MiB and then stops pulling. Chrome may buffer a few
      // MiB more, but the server must be far from writing the 40 MiB payload.
      assert(
        entry.bytesFlushed < entry.bytesTotal * 0.5,
        `server should be paused, flushed ${entry.bytesFlushed} of ${entry.bytesTotal}`
      );

      assert(await driver.exists("review-oversize"), "oversize note");
      assert(!(await driver.exists("view-button")), "View disabled for oversize");
      assert(await driver.exists("save-button"), "Save offered for oversize");

      await driver.click("review-cancel-button");
      await waitForForm(driver);
      await waitForStats(
        server,
        (next) => (next.paths[path]?.aborted ?? 0) >= 1,
        15_000
      );
      assertEqual(
        requestCount(server.stats(), path),
        1,
        "Cancel must not start a second request"
      );
    },
  },
  {
    name: "i) streaming save via File System Access stub: size and SHA-256 match",
    async run({ driver, server, app, expected }) {
      const path = "/big.age";
      await driver.open(app);
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver, 60_000);

      await installSaverStub(driver);
      assertEqual(await driver.eval("window.__pickerCalls"), 0, "picker before click");

      await driver.click("save-button");
      await waitForSaved(driver);
      assertEqual(await driver.eval("window.__pickerCalls"), 1, "picker called once");

      const info = await opfsFileInfo(driver, "big");
      assert(info !== null, "streamed file should exist");
      assertEqual(info.size, expected.bigSize, "streamed size");
      assertEqual(info.sha256, expected.bigSha256, "streamed SHA-256");
      assertEqual(
        requestCount(server.stats(), path),
        1,
        "one request for the whole save"
      );
    },
  },
  {
    name: "j) /varies.age: exactly one request for the whole run",
    async run({ driver, server, app, expected }) {
      const path = "/varies.age";
      await driver.open(app);
      await installSaverStub(driver);
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver);
      assertEqual(requestCount(server.stats(), path), 1, "one request before Save");

      await driver.click("save-button");
      await waitForSaved(driver);
      const info = await opfsFileInfo(driver, "varies");
      assert(info !== null, "saved file should exist");
      assertEqual(info.size, expected.variantSize, "saved size");
      assertEqual(
        requestCount(server.stats(), path),
        1,
        "one request for the whole run"
      );
    },
  },
  {
    name: "k) cancelling the save picker keeps review usable and one request",
    async run({ driver, server, app }) {
      const path = "/ok/hello.txt.age";
      await driver.open(app);
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver);

      await driver.eval(`(() => {
        window.__pickerCalls = 0;
        window.showSaveFilePicker = async ({ suggestedName } = {}) => {
          window.__pickerCalls += 1;
          if (window.__pickerCalls === 1) {
            throw new DOMException("cancelled", "AbortError");
          }
          const root = await navigator.storage.getDirectory();
          return root.getFileHandle(suggestedName, { create: true });
        };
        return true;
      })()`);

      await driver.click("save-button");
      await driver.waitFor(
        "!!document.querySelector('[data-testid=save-button]')",
        10_000
      );
      assertEqual(await driver.eval("window.__pickerCalls"), 1, "picker called once");
      assertEqual(
        await driver.eval(
          "document.querySelector('[data-testid=status-text]')?.textContent ?? null"
        ),
        null,
        "picker cancel must not stay in the saving state"
      );

      await driver.click("save-button");
      await waitForSaved(driver);
      assertEqual(await driver.eval("window.__pickerCalls"), 2, "picker called twice");
      const info = await opfsFileInfo(driver, "hello.txt");
      assert(info !== null, "saved file should exist after retry");
      assertEqual(info.size, 12, "saved size");
      assertEqual(requestCount(server.stats(), path), 1, "one fixture request total");
    },
  },
  {
    name: "l) hash change on a loaded page prefills and strips without fetching",
    async run({ driver, server, app }) {
      const path = "/ok/hello.txt.age";
      const target = server.url(path);

      await driver.open(app);
      await waitForForm(driver);
      await driver.setHash(fragmentHash({ u: target, pw: DEFAULT_PASS }));
      await driver.waitFor(
        `document.querySelector('[data-testid=file-url]').value === ${JSON.stringify(target)}`,
        10_000
      );

      assertEqual(await driver.value("file-url"), target, "prefilled URL");
      assertEqual(
        await driver.value("passphrase"),
        DEFAULT_PASS,
        "prefilled passphrase"
      );
      assertEqual(await driver.eval("location.hash"), "", "fragment stripped");
      assertEqual(requestCount(server.stats(), path), 0, "no fetch on hash change");
    },
  },
  {
    name: "m) save failure on oversize payloads leaves no partial file",
    async run({ driver, server, app }) {
      for (const [path, filename, expectedError] of [
        ["/tampered-large.age", "tampered-large", /Decryption failed|interrupted/],
        ["/drop-large.age", "drop-large", /interrupted/],
      ]) {
        await driver.open(app);
        await installSaverStub(driver);
        await fillAndSubmit(driver, server.url(path));
        await waitForReview(driver, 60_000);
        assert(await driver.exists("review-oversize"), `${path} should be oversize`);

        await driver.click("save-button");
        const message = await waitForError(driver, 60_000);
        assert(
          expectedError.test(message),
          `${path} error was ${JSON.stringify(message)}`
        );

        const info = await opfsFileInfo(driver, filename);
        assert(
          info === null || info.size === 0,
          `${path} left a partial file of ${info?.size} bytes`
        );
        assertEqual(requestCount(server.stats(), path), 1, `${path} one request`);
      }
    },
  },
  {
    name: "n) anchor saver saves a small file without File System Access",
    async run({ driver, server, app }) {
      await driver.open(app);
      await driver.eval("window.showSaveFilePicker = undefined; true");
      assertEqual(
        await driver.eval("typeof window.showSaveFilePicker"),
        "undefined",
        "picker removed"
      );

      await fillAndSubmit(driver, server.url("/ok/hello.txt.age"));
      await waitForReview(driver);
      await driver.click("save-button");
      await waitForSaved(driver);
      assertEqual(
        await driver.eval(
          "document.querySelector('[data-testid=error-banner]').hidden"
        ),
        true,
        "anchor save must not surface an error"
      );
    },
  },
  {
    name: "o) cancelling an in-progress save returns to the form without error",
    async run({ driver, server, app }) {
      const path = "/big.age";
      await driver.open(app);
      await installSaverStub(driver);
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver, 60_000);

      await driver.click("save-button");
      await driver.waitFor(
        "!!document.querySelector('[data-testid=save-cancel-button]')",
        10_000
      );
      await driver.click("save-cancel-button");
      await waitForForm(driver, 10_000);
      assertEqual(
        await driver.eval(
          "document.querySelector('[data-testid=error-banner]').hidden"
        ),
        true,
        "cancelling a save is not an error"
      );
      assertEqual(requestCount(server.stats(), path), 1, "one request for the run");
    },
  },
  {
    name: "p) ?saver=sw streams an oversize file to a real download (size/SHA-256, one request)",
    async run({ driver, server, app, expected }) {
      const path = "/big.age";
      await driver.open(saverUrl(app, "sw"));
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver, 60_000);
      assert(await driver.exists("review-oversize"), "oversize note");
      assert(await driver.exists("save-button"), "Save offered");

      await driver.click("save-button");
      await waitForSaved(driver, 120_000);

      assertEqual(
        await driver.eval(
          "document.querySelector('[data-testid=error-banner]').hidden"
        ),
        true,
        "no error after a streamed save"
      );
      assert(
        await driver.eval(
          "(async () => !!(await navigator.serviceWorker.getRegistration()))()"
        ),
        "the save registered the service worker lazily"
      );

      const file = await driver.waitForDownload("big", 60_000);
      assertEqual(file.size, expected.bigSize, "downloaded size");
      assertEqual(sha256File(file.path), expected.bigSha256, "downloaded SHA-256");
      assertEqual(requestCount(server.stats(), path), 1, "one fixture request");
    },
  },
  {
    name: "q) ?saver=sw failure: error banner, no complete download",
    async run({ driver, server, app, expected }) {
      for (const [path, filename, expectedError] of [
        ["/tampered-large.age", "tampered-large", /Decryption failed|interrupted/],
        ["/drop-large.age", "drop-large", /interrupted/],
      ]) {
        await driver.open(saverUrl(app, "sw"));
        await fillAndSubmit(driver, server.url(path));
        await waitForReview(driver, 60_000);
        assert(await driver.exists("review-oversize"), `${path} should be oversize`);

        await driver.click("save-button");
        const message = await waitForError(driver, 60_000);
        assert(
          expectedError.test(message),
          `${path} error was ${JSON.stringify(message)}`
        );
        assertEqual(requestCount(server.stats(), path), 1, `${path} one request`);

        // Record what the browser's download manager did with the failed stream.
        await delay(1_000);
        const files = driver.listDownloads();
        console.log(
          `    SW saver failure after ${path}: ${
            files.map((file) => `${file.name}=${file.size}B`).join(", ") || "no file"
          }`
        );
        const complete = files.find(
          (file) => file.complete && file.name.startsWith(filename)
        );
        assert(
          complete === undefined || complete.size < expected.largeSize,
          `${path} left a complete ${complete?.size}-byte file`
        );
      }
    },
  },
  {
    name: "r) ?saver=sw Cancel during saving aborts the download without an error",
    async run({ driver, server, app }) {
      const path = "/big.age";
      await driver.open(saverUrl(app, "sw"));
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver, 60_000);

      await driver.click("save-button");
      await driver.waitFor(
        "!!document.querySelector('[data-testid=save-cancel-button]')",
        10_000
      );
      // Let the service worker start pulling before cancelling.
      await delay(500);
      await driver.click("save-cancel-button");
      await waitForForm(driver, 15_000);

      assertEqual(
        await driver.eval(
          "document.querySelector('[data-testid=error-banner]').hidden"
        ),
        true,
        "cancelling a save is not an error"
      );
      await waitForStats(
        server,
        (stats) => (stats.paths[path]?.aborted ?? 0) >= 1,
        20_000
      );
      assertEqual(requestCount(server.stats(), path), 1, "one request for the run");
    },
  },
  {
    name: "s) ?saver=anchor refuses an oversize file with the unsupported message",
    async run({ driver, server, app }) {
      const path = "/big.age";
      await driver.open(saverUrl(app, "anchor"));
      await fillAndSubmit(driver, server.url(path));
      await waitForReview(driver, 60_000);

      await driver.click("save-button");
      assertIncludes(
        await waitForError(driver, 20_000),
        "cannot stream it to disk",
        "unsupported message"
      );
      assert(await driver.exists("save-button"), "review stays usable");
      assertEqual(requestCount(server.stats(), path), 1, "one request, no retry");
    },
  },
];
