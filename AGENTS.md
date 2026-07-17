# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is

A client-side, static web app that decrypts Age-encrypted files in the browser. See [README.md](README.md) for full product behavior.

## Architecture rule

- `src/core/` — pure processing logic. Must not depend on DOM APIs.
- `src/ui/` — DOM rendering and event wiring. May depend on `src/core/`, never the other way around.
- `src/main.ts` — composition root wiring `core` and `ui` together.

## Commands

- `npm ci` — install
- `npm run dev` — dev server
- `npm run lint` — ESLint
- `npm test` — Vitest
- `npm run build` — production build

Run lint, test, and build before considering a change complete.

## Conventions

- TypeScript (strict) for all new code.
- No new runtime dependencies without explicit justification (see [README.md](README.md#tech-stack)).
- Add or update tests in [test/](test) when core behavior changes.
- Keep changes small and focused; work incrementally.

## Security-sensitive areas

- Passphrase and file URL may arrive via the URL fragment (`#u=...&pw=...`) — never send or log the fragment, and never persist it to storage.
- Strip the fragment from the address bar after it's read.
- Treat any change to fragment parsing, decryption, or content rendering as security-sensitive; call out threat-model impact in the PR.

## Where to look

- [README.md](README.md) — product behavior, tech stack, project layout
- [CONTRIBUTING.md](CONTRIBUTING.md) — PR process
- [SECURITY.md](SECURITY.md) — vulnerability reporting

If requirements are unclear, ask instead of guessing.
