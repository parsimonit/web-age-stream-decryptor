# Contributing

Thanks for contributing.

## Development rules

- Keep processing logic in [src/core](src/core)
- Keep UI and DOM wiring in [src/ui](src/ui)
- Prefer small, focused pull requests
- Add or update tests when core behavior changes
- Avoid adding runtime dependencies without clear justification

## Setup

1. npm ci
2. npm run dev

## Validation before PR

1. `npm run verify` (or `devbox run -- npm run verify` inside devbox) = `npm run gate && npm run e2e`
2. `npm run gate` runs `check:node`, `lint`, `typecheck`, `format:check`, `test:cov`, `build`, `audit:prod`
3. `npm run e2e` is the local browser gate (CI-equivalent via `npm run e2e`); its first run needs `npx agent-browser install` if Chrome is missing

## Pull request guidance

- Explain behavior changes and risk areas
- Update [README.md](README.md) when product behavior changes
- Include manual verification notes for browser UX changes

## Security-sensitive changes

For security-impacting behavior (fragment handling, passphrase flows, content rendering), open a draft PR early and call out the threat-model impact.
