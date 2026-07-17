# Web Age Stream Decryptor

Client-side Age passphrase decryption in the browser.

This app fetches an encrypted Age payload over HTTPS, decrypts it in-browser, and then either:
- navigates to rendered content for HTML and PDF
- downloads decrypted bytes for other content types, or when force-download is enabled

Live app: https://decrypt-app.zebrastream.io/

## Why this exists

- Keep passphrases client-side
- Support fragment-driven links for zero-UI invocation
- Work as a static site with no backend
- Interoperate with standard Age payload encryption, including payloads produced for ZebraStream workflows

## Core behavior

- Manual form decrypt flow (URL + passphrase)
- Fragment flow: `#u=<encoded-url>&pw=<encoded-passphrase>[&d=1]`
- Partial fragment prefill when only one required field is present
- Force download option from UI or fragment (`d=1`)
- Copy Link action to generate a shareable fragment URL
- Content detection for HTML, PDF, binary
- User-friendly error handling for network, CORS, HTTP, format, and decrypt failures

## Security model

- Passphrase and encrypted file URL can be supplied via URL fragment, which is not sent in HTTP requests.
- App removes fragment values from the address bar after auto-decrypt startup.
- No server-side decryption. No backend persistence.

Important:
- Anyone with access to the full fragment URL can decrypt the target payload.
- Treat fragment links as secrets.
- Decrypted HTML content is navigated to directly (`location.replace` on a Blob URL) and will execute any script it contains. Only decrypt HTML payloads from sources you trust.

## Tech stack

| Component | Tool | Why |
|-----------|------|-----|
| **Language** | TypeScript (strict) | Type safety for data-heavy logic; better AI suggestions and refactor safety than plain JS |
| **Build / Dev Server** | Vite | Fast HMR, minimal config for vanilla TS + HTML/CSS |
| **Testing** | Vitest | Vite-native; runs pure processing modules without a browser context |
| **Linting** | ESLint (TypeScript-aware) | Enforces code quality rules consistently |
| **Formatting** | Prettier | Removes formatting discussions from code review |
| **Crypto** | age-encryption | Native TS/JS, Web Crypto API when available, streaming, no WASM |

Runtime dependencies: none by default. Any addition requires explicit justification.

## Local development

Prerequisites:
- Node.js 20+
- npm 10+

Install:

1. npm ci

Run dev server:

1. npm run dev

Run quality checks:

1. npm run lint
2. npm test
3. npm run build

Preview production build:

1. npm run preview

## Project layout

- [src/core](src/core): Pure processing logic (decrypt, detection, fragment parsing, shared types)
- [src/ui](src/ui): DOM adapters and rendering behavior
- [src/main.ts](src/main.ts): App orchestration
- [test](test): Unit tests for core logic

Rule: `src/core` must not depend on DOM APIs. `src/ui` may depend on `src/core`, but not the other way around.

## Release readiness checklist

- CI green for lint, tests, and build
- License and legal files present
- README current with behavior and limitations
- Manual test pass for fragment + force-download + copy-link flows
- Deployment target and URL validated

## Roadmap / known gaps

Not yet implemented:
- Harden HTML content detection (BOM/whitespace/doctype edge cases)
- Use `Content-Disposition` metadata to improve download filenames
- Loading spinner in the status area during decryption
- App logo in the UI
- Streaming download to disk for very large files (currently buffered in memory)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening PRs.

## License

MIT. See [LICENSE](LICENSE).