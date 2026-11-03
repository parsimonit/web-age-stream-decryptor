#!/usr/bin/env node
/**
 * Verifies that the Node.js major version is declared consistently across:
 *   - .nvmrc                      (bare major, e.g. "26")
 *   - package.json engines.node   (e.g. ">=26")
 *   - devbox.json packages        (e.g. "nodejs@26")
 *   - .github/workflows/ci.yml    (uses `node-version-file: .nvmrc`)
 *
 * Exits 1 with a clear message when anything is out of sync.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const failures = [];
const found = {};

try {
  found.nvmrc = read(".nvmrc").trim().replace(/^v/, "");
} catch {
  failures.push(".nvmrc is missing or unreadable");
}

try {
  const pkg = JSON.parse(read("package.json"));
  const engine = pkg.engines?.node;
  if (!engine) {
    failures.push('package.json is missing "engines.node"');
  } else {
    const match = /^\s*>=\s*v?(\d+)/.exec(engine);
    if (!match) {
      failures.push(
        `package.json "engines.node" must look like ">=<major>" (found "${engine}")`
      );
    } else {
      found.enginesNode = match[1];
    }
  }
} catch {
  failures.push("package.json is missing or unreadable");
}

try {
  const devbox = JSON.parse(read("devbox.json"));
  const entry = (devbox.packages ?? [])
    .map((pkg) => (typeof pkg === "string" ? pkg : pkg?.name))
    .find((pkg) => typeof pkg === "string" && /^nodejs@/.test(pkg));
  if (!entry) {
    failures.push('devbox.json packages has no "nodejs@<major>" entry');
  } else {
    found.devbox = entry.replace(/^nodejs@/, "").replace(/^v/, "");
  }
} catch {
  failures.push("devbox.json is missing or unreadable");
}

try {
  const ci = read(".github/workflows/ci.yml");
  if (!/node-version-file:\s*\.nvmrc/.test(ci)) {
    failures.push(
      ".github/workflows/ci.yml must set `node-version-file: .nvmrc` for actions/setup-node"
    );
  }
} catch {
  failures.push(".github/workflows/ci.yml is missing or unreadable");
}

const majors = Object.entries(found);
const distinct = new Set(majors.map(([, major]) => major));
if (majors.length > 1 && distinct.size > 1) {
  failures.push(
    `Node.js major version mismatch: ${majors
      .map(([source, major]) => `${source}=${major}`)
      .join(", ")}`
  );
}

if (failures.length > 0) {
  console.error("Node.js version check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    "\nKeep .nvmrc, package.json engines.node, devbox.json and ci.yml on the same major."
  );
  process.exit(1);
}

const [major] = distinct;
console.log(`Node.js version declarations are consistent (major ${major}).`);
