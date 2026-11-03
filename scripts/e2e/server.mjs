/**
 * Local fixture server for the browser E2E suite.
 *
 * Serves real-age fixtures from test/fixtures plus generated payloads (large,
 * tampered, truncated, HTML-with-script, varying ciphertext). Every request is
 * counted per path so scenarios can assert the app's single-request guarantee
 * and observe backpressure/aborts. CORS is enabled everywhere except /nocors/*.
 */
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Encrypter } from "age-encryption";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES = join(ROOT, "test", "fixtures");

export const DEFAULT_PASSPHRASE = "correct horse battery staple";
// Leading/trailing spaces and a non-ASCII character are intentional.
export const SPACES_PASSPHRASE = " pässword with spaces ";
const FAST_WORK_FACTOR = 10;
const BIG_PLAINTEXT_BYTES = 40 * 1024 * 1024;
const LARGE_PLAINTEXT_BYTES = 12 * 1024 * 1024;
const LARGE_DROP_AFTER = 11 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const WRITE_DELAY_MS = 4;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Builds a payload at most once, on first request, to keep startup fast. */
function lazy(factory) {
  let value;
  return () => (value ??= factory());
}

async function encryptBytes(bytes, passphrase = DEFAULT_PASSPHRASE) {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  encrypter.setScryptWorkFactor(FAST_WORK_FACTOR);
  return encrypter.encrypt(bytes);
}

function patternBytes(length, seed = 0x12345678) {
  const bytes = new Uint8Array(length);
  let x = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(1103515245, x) + 12345) >>> 0;
    bytes[i] = (x >>> 16) & 0xff;
  }
  return bytes;
}

const HTML_WITH_SCRIPT = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>e2e html payload</title></head>
  <body>
    <h1>e2e html payload</h1>
    <script>
      (function () {
        var result = { kind: "age-e2e-html", ran: true, parentAccess: "no", body: "" };
        try {
          result.parentTitle = window.parent.document.title;
          localStorage.getItem("age-e2e-probe");
          result.parentAccess = "yes";
        } catch (error) {
          result.error = error.name;
        }
        document.title = "PWNED";
        result.body = "SCRIPT_RAN parent=" + result.parentAccess;
        document.body.textContent = result.body;
        document.body.setAttribute("data-script-result", JSON.stringify(result));
        try {
          window.parent.postMessage(result, "*");
        } catch (error) {
          /* posting is best-effort */
        }
      })();
    </script>
  </body>
</html>
`;

async function buildPayloads() {
  const bigPlain = patternBytes(BIG_PLAINTEXT_BYTES);
  const big = await encryptBytes(bigPlain);

  const tamperBase = await encryptBytes(patternBytes(256 * 1024, 0xabc00001));
  const tampered = tamperBase.slice();
  // Keep the age header intact; corrupt a byte well inside the payload chunks.
  tampered[tampered.length - 1024] ^= 0xff;

  const drop = await encryptBytes(patternBytes(2 * 1024 * 1024, 0x0badf00d));

  const largeTampered = lazy(async () => {
    const bytes = (
      await encryptBytes(patternBytes(LARGE_PLAINTEXT_BYTES, 0x5eed1234))
    ).slice();
    // Corrupt a byte well past the buffer cap so review succeeds and Save fails.
    bytes[bytes.length - 1024] ^= 0xff;
    return bytes;
  });
  const largeDrop = lazy(() =>
    encryptBytes(patternBytes(LARGE_PLAINTEXT_BYTES, 0x0ddba11))
  );

  const htmlScript = await encryptBytes(HTML_WITH_SCRIPT);

  const variantTexts = ["variant-0", "variant-1", "variant-2"].map(
    (text) => `${text} payload: single-request guarantee\n`
  );
  const variants = await Promise.all(variantTexts.map((text) => encryptBytes(text)));

  return {
    big,
    bigPlain,
    bigSha256: createHash("sha256").update(bigPlain).digest("hex"),
    tampered,
    drop,
    largeTampered,
    largeDrop,
    htmlScript,
    variants,
    variantSize: Buffer.byteLength(variantTexts[0]),
    pdf: readFileSync(join(FIXTURES, "doc.pdf.age")),
    fixtures: new Map(),
  };
}

function fixtureBytes(payloads, name) {
  if (basename(name) !== name || !/^[A-Za-z0-9._-]+\.age$/.test(name)) {
    return null;
  }
  if (!payloads.fixtures.has(name)) {
    try {
      payloads.fixtures.set(name, readFileSync(join(FIXTURES, name)));
    } catch {
      return null;
    }
  }
  return payloads.fixtures.get(name);
}

function newEntry() {
  return {
    requests: 0,
    active: 0,
    completed: 0,
    aborted: 0,
    bytesFlushed: 0,
    bytesTotal: 0,
  };
}

function statFor(stats, pathname) {
  if (!stats.has(pathname)) stats.set(pathname, newEntry());
  return stats.get(pathname);
}

function snapshot(stats) {
  const paths = {};
  let requests = 0;
  let bytesFlushed = 0;
  for (const [pathname, entry] of stats) {
    paths[pathname] = { ...entry };
    requests += entry.requests;
    bytesFlushed += entry.bytesFlushed;
  }
  return { requests, bytesFlushed, paths };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Disposition",
};

function sendBytes(_req, res, entry, bytes, { cors = true, status = 200 } = {}) {
  res.writeHead(status, {
    "Content-Type": "application/octet-stream",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    ...(cors ? CORS_HEADERS : {}),
  });
  entry.bytesFlushed += bytes.length;
  res.end(bytes);
}

async function streamSlow(res, entry, bytes) {
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });

  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    if (res.destroyed) return;
    const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
    entry.bytesFlushed += chunk.length;
    try {
      if (!res.write(chunk)) await once(res, "drain");
    } catch {
      return;
    }
    if (res.destroyed) return;
    await delay(WRITE_DELAY_MS);
  }
  if (!res.destroyed) res.end();
}

function sendAndDrop(res, entry, bytes) {
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });
  const partial = bytes.subarray(0, Math.min(bytes.length - 1, 1024 * 1024));
  entry.bytesFlushed += partial.length;
  res.write(partial, () => {
    res.destroy();
  });
}

/** Streams past the buffer cap and then drops the connection mid-payload. */
async function streamThenDrop(res, entry, bytes, dropAfter) {
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });

  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    if (res.destroyed) return;
    const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
    entry.bytesFlushed += chunk.length;
    try {
      if (!res.write(chunk)) await once(res, "drain");
    } catch {
      return;
    }
    if (res.destroyed) return;
    if (offset + chunk.length >= dropAfter) {
      res.destroy();
      return;
    }
    await delay(WRITE_DELAY_MS);
  }
  if (!res.destroyed) res.end();
}

async function handle(req, res, payloads, stats, state) {
  const url = new URL(req.url ?? "/", "http://fixture.invalid");
  const pathname = url.pathname;

  if (pathname === "/__stats") {
    const body = JSON.stringify(snapshot(stats));
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    });
    res.end(body);
    return;
  }

  if (pathname === "/__reset" && req.method === "POST") {
    stats.clear();
    state.variantIndex = 0;
    res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
    res.end('{"ok":true}');
    return;
  }

  const entry = statFor(stats, pathname);
  entry.requests += 1;
  entry.active += 1;
  let counted = false;
  const finish = (aborted) => {
    if (counted) return;
    counted = true;
    entry.active -= 1;
    if (aborted) entry.aborted += 1;
    else entry.completed += 1;
  };
  res.on("close", () => finish(!res.writableEnded));

  if (pathname === "/big.age") {
    entry.bytesTotal = payloads.big.length;
    await streamSlow(res, entry, payloads.big);
    return;
  }

  if (pathname === "/drop.age") {
    entry.bytesTotal = payloads.drop.length;
    sendAndDrop(res, entry, payloads.drop);
    return;
  }

  if (pathname === "/tampered.age") {
    sendBytes(req, res, entry, payloads.tampered);
    return;
  }

  if (pathname === "/tampered-large.age") {
    const bytes = await payloads.largeTampered();
    entry.bytesTotal = bytes.length;
    sendBytes(req, res, entry, bytes);
    return;
  }

  if (pathname === "/drop-large.age") {
    const bytes = await payloads.largeDrop();
    entry.bytesTotal = bytes.length;
    await streamThenDrop(res, entry, bytes, LARGE_DROP_AFTER);
    return;
  }

  if (pathname === "/html-script.age") {
    sendBytes(req, res, entry, payloads.htmlScript);
    return;
  }

  if (pathname === "/pdf.age") {
    sendBytes(req, res, entry, payloads.pdf);
    return;
  }

  if (pathname === "/varies.age") {
    const index = state.variantIndex % payloads.variants.length;
    state.variantIndex += 1;
    sendBytes(req, res, entry, payloads.variants[index]);
    return;
  }

  const match = /^\/(ok|nocors)\/([^/]+)$/.exec(pathname);
  if (match) {
    const bytes = fixtureBytes(payloads, match[2]);
    if (!bytes) {
      sendBytes(req, res, entry, Buffer.from("not found"), {
        cors: match[1] !== "nocors",
        status: 404,
      });
      return;
    }
    sendBytes(req, res, entry, bytes, { cors: match[1] !== "nocors" });
    return;
  }

  sendBytes(req, res, entry, Buffer.from("not found"), { status: 404 });
}

export async function startFixtureServer() {
  const payloads = await buildPayloads();
  const stats = new Map();
  const state = { variantIndex: 0 };

  const server = createServer((req, res) => {
    handle(req, res, payloads, stats, state).catch(() => {
      if (!res.headersSent) res.writeHead(500, CORS_HEADERS);
      res.end("fixture server error");
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("fixture server did not bind a TCP port");
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    url(pathname) {
      return `${origin}${pathname}`;
    },
    stats() {
      return snapshot(stats);
    },
    reset() {
      stats.clear();
      state.variantIndex = 0;
    },
    expected: {
      bigSize: payloads.bigPlain.length,
      bigSha256: payloads.bigSha256,
      bigCipherSize: payloads.big.length,
      variantSize: payloads.variantSize,
      largeSize: LARGE_PLAINTEXT_BYTES,
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
