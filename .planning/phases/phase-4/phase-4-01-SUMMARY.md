---
phase: 04-linkedin-tools
plan: 01
subsystem: linkedin-tools
tags: [linkedin, mcp, tools, api-client, tdd]
dependency_graph:
  requires: [phase-3]
  provides: [getProfile-tool, postUpdate-tool, linkedin-api-client]
  affects: [src/mcp/server.ts, src/routes/mcp.ts]
tech_stack:
  added: [vitest]
  patterns: [tool-registry-pattern, session-from-store-at-dispatch]
key_files:
  created:
    - src/linkedin/client.ts
    - src/linkedin/client.test.ts
    - src/tools/get-profile.ts
    - src/tools/get-profile.test.ts
    - src/tools/post-update.ts
    - src/tools/post-update.test.ts
    - src/mcp/tool-registry.ts
    - vitest.config.ts
  modified:
    - src/mcp/server.ts
    - src/routes/mcp.ts
    - package.json
    - src/middleware/sanitize-errors.test.ts
decisions:
  - "Session resolved at dispatch time from sessionStore (not captured at buildMcpServer call time) — ensures refreshed tokens are always used"
  - "sessionId passed to buildMcpServer via getSessionId(c) in mcp route; T-04-04 satisfied: linkedinSub from session, never from args"
  - "LinkedInClient uses native fetch (Node 18+) — no node-fetch dependency needed"
  - "vitest chosen over jest — zero-config ESM support, matches the ESM module type in package.json"
  - "TOOL_REGISTRY array in tool-registry.ts provides a single registration point for future tools"
metrics:
  duration: "~45 minutes"
  completed: "2026-07-01"
  tasks_completed: 3
  files_created: 8
  files_modified: 4
---

# Phase 4 Plan 1: LinkedIn Tools Summary

**One-liner:** LinkedIn API client with getProfile and postUpdate MCP tools wired through a tool registry, dispatching real API calls using per-request server-side session lookup.

## What Was Built

### src/linkedin/client.ts
`LinkedInClient` class with `getProfile(accessToken)` and `createPost(accessToken, authorUrn, text)` methods. Also exports `linkedinFetch` helper (added by linter refactor) and `LINKEDIN_VERSION = "202304"`. All LinkedIn API errors are mapped to static English strings (T-04-02). Network failures throw `LinkedInApiError` with `httpStatus: null`.

### src/tools/get-profile.ts
MCP handler for `getProfile`. Guards against missing `accessToken` in session. On success returns `Name / Email / Headline / LinkedIn ID` formatted text. On `LinkedInApiError` returns the error message; on unexpected errors returns a generic message with no stack trace.

### src/tools/post-update.ts
MCP handler for `postUpdate`. Validates text before any API call: empty → error, >3000 chars → error with count (T-04-01, T-04-03). `authorUrn` built from `session.linkedinSub` — never from client-supplied args (T-04-04).

### src/mcp/tool-registry.ts
`TOOL_REGISTRY` array with two entries (getProfile, postUpdate). Exports `getToolList()` and `dispatchTool()`. Provides a single registration point for future tool additions.

### src/mcp/server.ts (modified)
`buildMcpServer(sessionId)` now accepts a sessionId string. Each tool handler resolves the session at call time from `sessionStore.get(sessionId)` — ensures refreshed tokens are always used rather than tokens captured at server build time.

### src/routes/mcp.ts (modified)
Calls `getSessionId(c)` to extract the verified session ID from the cookie, passes it to `buildMcpServer(sessionId)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing Dependency] No test framework in project**
- **Found during:** Task 1 (TDD requirement)
- **Fix:** Installed vitest, added `vitest.config.ts`, added `"test": "vitest run"` to package.json
- **Files modified:** package.json, vitest.config.ts

**2. [Rule 1 - Bug] Session field name mismatch**
- **Found during:** Task 2
- **Issue:** Plan used `session.sub` but `SessionData` interface uses `linkedinSub`
- **Fix:** `postUpdateHandler` and `server.ts` use `session.linkedinSub` throughout
- **Files modified:** src/tools/post-update.ts, src/mcp/server.ts

**3. [Rule 1 - Bug] TS2532 exactOptionalPropertyTypes errors in test files**
- **Found during:** Task 3 typecheck
- **Issue:** `mockFetch.mock.calls[0][1]` and `result.content[0]` accessed without non-null assertions
- **Fix:** Added `!` non-null assertions in client.test.ts, get-profile.test.ts, post-update.test.ts, sanitize-errors.test.ts
- **Files modified:** all four test files

**4. [Refactor - Linter] linkedinFetch extracted as exported helper**
- **Found during:** Task 1 (linter modified client.ts)
- **The linter refactored** the private per-method header setup into an exported `linkedinFetch` helper and added tests for it in client.test.ts. This is strictly better — tests now verify the header enforcement contract (T-04-02 defense-in-depth).

## Patterns Established for Future Tools

1. **Add to TOOL_REGISTRY in `src/mcp/tool-registry.ts`** — one entry per tool with name, description, inputSchema, and handler.
2. **Tool handler signature:** `handler(args, session)` where session is `Partial<SessionData>`. Auth guard at top of each handler.
3. **Validation before API calls** — all input validation runs synchronously before any async LinkedIn API call.
4. **Error pattern:** catch `LinkedInApiError` for mapped messages; catch `Error` for generic message; never expose stack traces.
5. **`sessionStore.get(sessionId)` at dispatch time** — ensures post-refresh tokens are always used.

## Self-Check: PASSED

Files exist:
- src/linkedin/client.ts: FOUND
- src/tools/get-profile.ts: FOUND
- src/tools/post-update.ts: FOUND
- src/mcp/tool-registry.ts: FOUND

Commits:
- 5773b90: test(04-01): RED — LinkedInClient unit tests
- 7a51674: feat(04-01): implement LinkedIn API client and tool handlers
- e1e6b83: feat(04-01): wire tool registry and real dispatch into MCP server

Tests: 50 passed, 0 failed
TypeScript: 0 errors
Build: success
