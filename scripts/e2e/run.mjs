/**
 * E2E release gate orchestrator.
 *
 * Builds the app, serves dist with `vite preview` on a free loopback port,
 * starts the fixture server, drives scenarios through agent-browser, prints a
 * pass/fail table, and always tears everything down.
 */
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { get } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { AgentBrowserDriver } from "./driver.mjs";
import { scenarios } from "./scenarios.mjs";
import { startFixtureServer } from "./server.mjs";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const VITE_BIN = join(ROOT, "node_modules", ".bin", "vite");
const SESSION = `age-e2e-${process.pid}`;
let activeCleanup = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("could not allocate a preview port");
  }
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function httpStatus(url) {
  return new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", () => resolve(0));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(0);
    });
  });
}

async function waitForPreview(url, child, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`vite preview exited with code ${child.exitCode}`);
    }
    if ((await httpStatus(url)) === 200) return;
    await delay(200);
  }
  throw new Error(`vite preview did not become ready at ${url}`);
}

function collectIssues(driver) {
  return (async () => {
    const messages = await driver.consoleMessages();
    const errors = await driver.pageErrors();
    const csp = await driver.cspViolations();
    const issues = [];
    for (const message of messages) {
      if (message.type === "error" || message.type === "warning") {
        issues.push(`console ${message.type}: ${message.text}`);
      }
    }
    for (const error of errors) {
      issues.push(`page error: ${error.text}`);
    }
    for (const violation of csp) {
      issues.push(
        `CSP ${violation.directive} blocked ${violation.blocked}${
          violation.source ? ` from ${violation.source}` : ""
        }`
      );
    }
    return issues;
  })();
}

function formatRow(name, status, detail) {
  const label = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status;
  const suffix = detail ? ` — ${detail.split("\n")[0]}` : "";
  return `${label.padEnd(4)}  ${name}${suffix}`;
}

async function main() {
  let preview = null;
  let fixture = null;
  let driver = null;
  const results = [];
  let cleanupIssues = [];
  let cspIssues = 0;

  const cleanup = async () => {
    if (driver) await driver.close();
    if (preview) {
      if (preview.exitCode === null) {
        preview.kill("SIGTERM");
        await Promise.race([
          new Promise((resolve) => preview.once("exit", resolve)),
          delay(3000),
        ]);
        if (preview.exitCode === null) preview.kill("SIGKILL");
      }
    }
    if (fixture) await fixture.close();
  };
  activeCleanup = cleanup;

  try {
    console.log("E2E: building dist…");
    await execFileAsync("npm", ["run", "build"], {
      cwd: ROOT,
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });

    fixture = await startFixtureServer();
    const port = await freePort();
    const app = `http://127.0.0.1:${port}/`;

    console.log(`E2E: preview ${app}`);
    console.log(`E2E: fixtures ${fixture.origin}`);

    preview = spawn(
      VITE_BIN,
      ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
    );
    let previewOutput = "";
    preview.stdout.on("data", (chunk) => {
      previewOutput += chunk;
    });
    preview.stderr.on("data", (chunk) => {
      previewOutput += chunk;
    });

    try {
      await waitForPreview(app, preview);
    } catch (error) {
      throw new Error(`${error.message}\n${previewOutput.trim()}`, { cause: error });
    }

    driver = new AgentBrowserDriver({ session: SESSION });
    console.log(`E2E: agent-browser session ${SESSION}`);
    console.log("");

    for (const scenario of scenarios) {
      fixture.reset();
      driver.clearDownloads();
      await driver.clearConsole();
      await driver.clearPageErrors();
      const started = Date.now();
      try {
        await scenario.run({
          driver,
          server: fixture,
          app,
          expected: fixture.expected,
        });
        const issues = await collectIssues(driver);
        if (issues.length > 0) {
          cspIssues += 1;
          throw new Error(`CSP/console issues:\n${issues.join("\n")}`);
        }
        results.push({
          name: scenario.name,
          status: "pass",
          detail: `${Date.now() - started}ms`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ name: scenario.name, status: "fail", detail: message });
      }
    }
  } catch (error) {
    cleanupIssues.push(error instanceof Error ? error.message : String(error));
  } finally {
    await cleanup();
  }

  for (const issue of cleanupIssues) {
    results.push({ name: "harness", status: "fail", detail: issue });
  }

  results.push({
    name: "z) CSP/console clean across all scenarios",
    status: cspIssues === 0 && cleanupIssues.length === 0 ? "pass" : "fail",
    detail:
      cspIssues === 0 && cleanupIssues.length === 0
        ? "no violations"
        : `${cspIssues} scenario(s) with violations`,
  });

  console.log("");
  for (const result of results) {
    console.log(formatRow(result.name, result.status, result.detail));
  }

  const failed = results.filter((result) => result.status === "fail");
  console.log("");
  console.log(
    `${results.length - failed.length} passed, ${failed.length} failed (agent-browser session ${SESSION})`
  );

  if (failed.length > 0) process.exitCode = 1;
}

function interrupt(signal) {
  Promise.resolve(activeCleanup?.())
    .catch(() => undefined)
    .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
}
process.once("SIGINT", () => interrupt("SIGINT"));
process.once("SIGTERM", () => interrupt("SIGTERM"));

await main();
