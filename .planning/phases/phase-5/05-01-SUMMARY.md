---
phase: 05-security-hardening
plan: "01"
subsystem: security
tags: [security, config, middleware, linkedin-api, gitignore]
dependency_graph:
  requires: []
  provides: [startup-validation, error-sanitization, linkedin-fetch-helper, gitignore-enforcement]
  affects: [src/config.ts, src/index.ts, src/linkedin/client.ts]
tech_stack:
  added: []
  patterns: [fail-fast-validation, error-sanitization-middleware, enforced-header-helper]
key_files:
  created:
    - src/config.test.ts
    - src/middleware/sanitize-errors.ts
    - src/middleware/sanitize-errors.test.ts
  modified:
    - src/config.ts
    - src/index.ts
    - src/linkedin/client.ts
    - src/linkedin/client.test.ts
decisions:
  - "Kept UPPER_SNAKE_CASE property aliases on Config type for backward compat with existing callers while adding camelCase properties per spec"
  - "Used vitest instead of node:test — project already uses vitest (vitest.config.ts present)"
  - "Guarded module-level validateConfig() call in config.ts with VITEST env check to allow test-only imports"
  - "linkedinFetch() added alongside existing LinkedInClient class in client.ts (Phase 4 file already existed with correct headers)"
  - "sanitizeErrors reads LINKEDIN_CLIENT_SECRET directly from process.env to avoid circular dep with config.ts"
metrics:
  duration: "~8 minutes"
  completed: "2026-07-01"
  tasks_completed: 5
  files_changed: 7
---

# Phase 5 Plan 01: Security Hardening Summary

One-liner: Fail-fast startup validation, secret-redacting error middleware, enforced LinkedIn fetch headers, and gitignore audit — all verified with 50 passing tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Startup validation — config.ts (SEC-01) | b232a65 | src/config.ts, src/config.test.ts |
| 2 | Sanitize-errors middleware (SEC-02) | b232a65 | src/middleware/sanitize-errors.ts, src/middleware/sanitize-errors.test.ts, src/index.ts |
| 3 | linkedinFetch() helper (SEC-04) | b232a65 | src/linkedin/client.ts, src/linkedin/client.test.ts |
| 4 | .gitignore audit (SEC-05) | b232a65 | .gitignore (already had .env) |
| 5 | MCP SDK version audit (CVE) | b232a65 | package.json (no change needed) |

## Security Requirements Verified

- **SEC-01:** validateConfig() throws descriptive errors (no secret values in messages); process.exit(1) on failure; success prints one clean confirmation line. SESSION_SECRET must be >= 32 chars.
- **SEC-02:** sanitizeErrors Hono error handler redacts LINKEDIN_CLIENT_SECRET from err.message and err.stack before any output. Wired into src/index.ts after all routes via `app.onError(sanitizeErrors)`.
- **SEC-04:** linkedinFetch() always sets Authorization, LinkedIn-Version (202304), and X-Restli-Protocol-Version (2.0.0) — caller-supplied values for these headers are overwritten. No direct `fetch("https://api.linkedin.com")` calls exist outside client.ts.
- **SEC-05:** .gitignore has bare `.env` line. Git history is clean (no .env commits).
- **CVE:** @modelcontextprotocol/sdk 1.29.0 installed (>= 1.24.0 required for Origin validation fix).

## Test Results

- Total tests: 50 passing across 5 test files
- src/config.test.ts: 11 tests (missing SECRET, empty, too-short, valid 32-char, valid 64-char, shape, port default, no-secret-in-error-msg)
- src/middleware/sanitize-errors.test.ts: 10 tests (sanitizeSecret pure helper, sanitizeErrors middleware behavior)
- src/linkedin/client.test.ts: 17 tests (LinkedInClient.getProfile, createPost, linkedinFetch header enforcement)
- TypeScript: 0 errors

## Git History Audit (SEC-05)

`git log --all --oneline -- .env` — no output. History is clean.

## Deviations from Plan

**1. [Rule 3 - Compatibility] Kept UPPER_SNAKE_CASE aliases on Config type**
- Found during: Task 1
- Issue: Existing code (src/auth/cookie.ts, src/auth/linkedin.ts, src/middleware/*.ts, src/index.ts, src/routes/*.ts) uses config.SESSION_SECRET, config.PORT, config.ALLOWED_ORIGINS etc.
- Fix: Config interface has both camelCase (spec) and UPPER_SNAKE_CASE (backward compat) properties
- Files modified: src/config.ts

**2. [Rule 3 - Test runner] Used vitest instead of node:test**
- Found during: Task 1
- Issue: Project already uses vitest (vitest.config.ts, package.json test script), and node --test + tsx/esm caused recursive test runner warnings
- Fix: Wrote all tests using vitest (describe/test/expect/vi)
- Files modified: src/config.test.ts, src/middleware/sanitize-errors.test.ts

**3. [Rule 3 - Guard] Added VITEST env check to prevent module-level side effects during tests**
- Found during: Task 1
- Issue: config.ts runs validateConfig() at module scope; importing it in tests triggered process.exit(1)
- Fix: `const isTest = process.env.VITEST != null` guard skips initConfig() during test runs
- Files modified: src/config.ts

**4. [Rule 1 - Existing file] Phase 4's client.ts already existed with correct headers**
- Found during: Task 3
- Phase 4 had already created LinkedInClient class with all 3 required headers. Added linkedinFetch() export and exported LINKEDIN_VERSION constant alongside the existing class.
- No stub needed.

## Known Stubs

None.

## Threat Flags

None — all surfaces were within the plan's threat model scope.

## Self-Check: PASSED

- src/config.ts — exists, exports validateConfig and config
- src/middleware/sanitize-errors.ts — exists, exports sanitizeSecret and sanitizeErrors
- src/linkedin/client.ts — exists, exports linkedinFetch and LINKEDIN_VERSION
- Commit b232a65 — verified in git log
- 50 tests passing — verified via npx vitest run
- TypeScript: 0 errors — verified via npx tsc --noEmit
- Build: success — verified via npm run build
