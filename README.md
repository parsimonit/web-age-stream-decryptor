# Web Age Stream Decryptor

Client-side Age passphrase decryption in the browser.

This app fetches an encrypted Age payload over HTTPS, decrypts it in-browser, and shows a review of what was decrypted before the user either:

- views HTML, SVG, or PDF content in an isolated frame
- saves the decrypted bytes to disk

Live app: https://decrypt-app.zebrastream.io/

## Why this exists

- Keep passphrases client-side
- Support fragment-driven links for zero-UI invocation
- Work as a static site with no backend
- Interoperate with standard Age payload encryption, including payloads produced for ZebraStream workflows

## Core behavior

- Manual form decrypt flow (URL + passphrase)
- Fragment prefill: `#u=<encoded-url>&pw=<encoded-passphrase>[&d=1]`
- Fragment never auto-starts decryption; the user still reviews and confirms
- Partial fragment prefill when only one required field is present
- Review gate before any view or save: host, file name, detected type, size, and warnings
- HTML/SVG review opens a sandboxed iframe with scripts disabled; "Run scripts" is an explicit opt-in and the frame never gets `allow-same-origin`
- PDF review opens the browser's PDF viewer in an iframe
- Save-only mode from the checkbox or fragment (`d=1`), which hides View
- Content detection for HTML, SVG, PDF, and binary
- 10 MiB in-memory cap: larger payloads are reviewable as save-only and streamed to disk — through the File System Access API in Chromium, or through a service-worker download in browsers without it
- User-friendly error handling for network, CORS, HTTP, format, decrypt, and interrupted downloads

## Browser support

- **Chromium**: streaming saves above the 10 MiB cap use the File System Access API.
- **Firefox/Safari**: the same large files are streamed into the browser's download manager by a service worker (requires a secure context). This path is implemented and exercised in Chromium through the test hook below, but Firefox and Safari have not been verified automatically yet; a manual check is still pending.

## Security model

- Passphrase and encrypted file URL can be supplied via the URL fragment, which browsers do not send in HTTP requests.
- The app strips the fragment from the address bar immediately after reading it, and never logs or persists it.
- The fragment is a prefill convenience only. Decryption always requires an explicit user action.
- A review step shows what will be viewed or saved before any content is rendered or written.
- Decrypted HTML/SVG runs in a sandboxed iframe. Scripts stay disabled unless the user opts in; even then the frame has no same-origin access to the app, its storage, or its DOM.
- Plain `http://` file URLs (non-loopback) are flagged as insecure before fetching. HTTPS pages cannot fetch plain HTTP; the browser blocks it as mixed content.
- Payloads up to the 10 MiB cap are held in memory. Larger files are never rendered: they are streamed to disk through the File System Access API where available, otherwise through a service worker that relays the decrypted stream into the browser's download manager. Non-download requests are never intercepted, the worker never caches or fetches anything itself, and it only answers one-shot, unguessable ids registered by the page moments earlier. A failed or cancelled download can leave a partial file that the page cannot delete.
- The service worker only handles `__download__/<one-shot id>` requests within its scope, only sees navigation requests there, and never logs or forwards URLs.
- No server-side decryption. No backend persistence.

Important:

- Anyone with access to the full fragment URL can decrypt the target payload.
- Treat fragment links as secrets.
- Decrypted content is still untrusted. Viewing it is opt-in, and enabling scripts means running code from the encrypted file.

## Tech stack

| Component              | Tool                      | Why                                                                                       |
| ---------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| **Language**           | TypeScript (strict)       | Type safety for data-heavy logic; better AI suggestions and refactor safety than plain JS |
| **Build / Dev Server** | Vite                      | Fast HMR, minimal config for vanilla TS + HTML/CSS                                        |
| **Testing**            | Vitest                    | Vite-native; runs pure processing modules without a browser context                       |
| **Linting**            | ESLint (TypeScript-aware) | Enforces code quality rules consistently                                                  |
| **Formatting**         | Prettier                  | Removes formatting discussions from code review                                           |
| **Crypto**             | age-encryption            | Native TS/JS, Web Crypto API when available, streaming, no WASM                           |

Runtime dependencies: none by default. Any addition requires explicit justification.

## Local development

Prerequisites:

- Node.js 26+
- npm 10+

The Node.js major is pinned in `.nvmrc`; `npm run check:node` verifies that `.nvmrc`, `package.json` engines, `devbox.json`, and CI agree. With devbox installed, `devbox run -- npm run gate` runs the full check suite inside the devbox environment.

Install:

1. npm ci

Run dev server:

1. npm run dev

Run quality checks:

1. `npm run gate` runs every check below in order: `check:node`, `lint`, `typecheck`, `format:check`, `test:cov`, `test:interop`, `build`, `audit:prod`
2. Individual checks: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run test:cov`, `npm run test:interop`, `npm run build`, `npm run audit:prod`

Preview production build:

1. npm run preview

Run the browser E2E release gate:

1. `npm run e2e` builds the app, starts a fixture server and `vite preview`, drives headless Chrome via agent-browser, and prints a pass/fail table
2. `npm run verify` runs `npm run gate && npm run e2e`
3. The first E2E run needs Chrome for agent-browser: run `npx agent-browser install` if it is missing
4. E2E is local for now and is CI-equivalent via `npm run e2e`; see the roadmap for an optional CI job

Test hook: append `?saver=fsa|sw|anchor` to the app URL to force a save destination; `?saver=sw` exercises the service-worker path in Chromium.

## Project layout

- [src/core](src/core): Pure processing logic (decrypt, detection, fragment parsing, shared types)
- [src/ui](src/ui): DOM adapters and rendering behavior
- [src/main.ts](src/main.ts): App orchestration
- [public](public): Static files copied as-is by the build (the download service worker)
- [test](test): Unit tests for core logic
- [scripts/e2e](scripts/e2e): Browser E2E orchestrator, fixture server, scenarios, and the agent-browser driver

Rule: `src/core` must not depend on DOM APIs. `src/ui` may depend on `src/core`, but not the other way around.

## Release readiness checklist

- CI green for lint, tests, and build
- `npm run e2e` passes locally (or in the optional CI E2E job)
- License and legal files present
- README current with behavior and limitations
- Manual test pass for fragment prefill, review gate, save-only, and HTML scripts opt-in
- Deployment target and URL validated

## Roadmap / known gaps

Not yet implemented:

- Auto-start after confirmation: remember consent per content kind in localStorage (never keyed by URL/passphrase, never persisting the fragment; cookies are the wrong tool since they are sent to the host; consent must be revocable/optional)
- Cross-browser e2e (Playwright: Chromium/Firefox/WebKit); may replace agent-browser only once it covers every scenario; only `scripts/e2e/driver.mjs` should need replacing
- Manual verification of the service-worker saver in Firefox and Safari (only Chromium is automated so far)
- Optional CI job for e2e (`npm run e2e`; Chrome via `npx agent-browser install`; devbox env also works)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening PRs.

## License

MIT. See [LICENSE](LICENSE).
