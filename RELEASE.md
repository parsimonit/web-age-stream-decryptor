# Release Guide

This project follows SemVer and Conventional Commits.

## Commit style

Use this format:

type(scope): short summary

Examples:
- feat(ui): add copy link feedback
- fix(fragment): handle empty pw in hash
- docs: update release notes

Supported types:
- feat: new user-facing functionality (minor bump)
- fix: bug fix (patch bump)
- perf: performance improvement (patch bump)
- refactor: internal change without behavior change
- test: tests only
- docs: docs only
- chore: tooling or housekeeping

Breaking changes:
- Add ! after type or scope, for example feat!: remove old fragment format
- Or include BREAKING CHANGE: in the commit body
- Any breaking change means a major bump

## Versioning rules

- Patch: fixes and small improvements, for example 0.1.0 -> 0.1.1
- Minor: new backward-compatible features, for example 0.1.1 -> 0.2.0
- Major: breaking changes, for example 0.2.0 -> 1.0.0

## Release checklist

1. Ensure main is green in CI.
2. Run local checks:
   - npm run lint
   - npm test
   - npm run build
3. Pick next version based on commits since last tag.
4. Update package.json version.
5. Add a short changelog section to the GitHub Release notes.
6. Tag and push.

## Create a release

1. Bump version:
   - npm version patch
   - or npm version minor
   - or npm version major
2. Push commits and tags:
   - git push origin main --follow-tags
3. In GitHub, create a release from the new tag.
4. Title format: vX.Y.Z
5. Notes sections:
   - Added
   - Fixed
   - Breaking changes (if any)

## Hotfix flow

1. Branch from main.
2. Use fix commits.
3. Merge after CI passes.
4. Cut a patch release.
