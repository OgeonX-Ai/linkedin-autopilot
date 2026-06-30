---
phase: "02-mcp-protocol-layer"
plan: "01"
status: complete
subsystem: mcp-transport
tags: [mcp, hono, streamable-http, oauth-discovery, origin-guard]
dependency_graph:
  requires: [phase-1-bootstrap]
  provides: [mcp-endpoint, well-known-discovery, origin-guard, auth-challenge-header]
  affects: [phase-3-oauth, phase-4-tools]
tech_stack:
  added:
    - "@modelcontextprotocol/sdk@1.29.0 (StreamableHTTPServerTransport, McpServer)"
  patterns:
    - "Hono middleware chain: originGuard -> authChallenge -> routes"
    - "Per-request McpServer + transport factory (stateless mode, no sessionIdGenerator)"
    - "HttpBindings from @hono/node-server for c.env.incoming / c.env.outgoing access"
key_files:
  created:
    - src/mcp/server.ts
    - src/middleware/origin.ts
    - src/middleware/auth-challenge.ts
    - src/routes/mcp.ts
    - src/routes/well-known.ts
  modified:
    - src/config.ts
    - src/index.ts
    - .env.example
decisions:
  - "Used StreamableHTTPServerTransport (not NodeStreamableHTTPServerTransport — that name does not exist in SDK 1.29.0; the class is StreamableHTTPServerTransport from @modelcontextprotocol/sdk/server/streamableHttp.js)"
  - "McpServer is instantiated per-request via buildMcpServer() factory (not a singleton) to avoid state leakage across stateless connections"
  - "sessionIdGenerator is omitted entirely (not set to undefined) to satisfy exactOptionalPropertyTypes TypeScript strict mode"
  - "Transport is cast as unknown as Transport for mcpServer.connect() due to optional-callback mismatch under exactOptionalPropertyTypes — this is a SDK type issue, not a runtime problem"
  - "Hono handler for /mcp does not return a Response object — transport.handleRequest() writes directly to rawRes; returning a Hono Response after that causes ERR_HTTP_HEADERS_SENT"
  - "@hono/node-server env keys confirmed: incoming: IncomingMessage, outgoing: ServerResponse (from HttpBindings type in node_modules/@hono/node-server/dist/types.d.ts)"
  - "ALLOWED_ORIGINS made required (not optional with default) to force explicit configuration in production"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-30"
  tasks_completed: 7
  files_created: 5
  files_modified: 3
---

# Phase 2 Plan 01: MCP Protocol Layer Summary

MCP 2025-06-18 Streamable HTTP transport wired into Hono with origin guard, auth challenge header, and OAuth discovery endpoint.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Install SDK + extend config | Done | 23390c2 |
| 2 | McpServer with stub tools | Done | 23390c2 |
| 3 | Origin guard middleware | Done | 23390c2 |
| 4 | MCP route handler (Streamable HTTP) | Done | 23390c2 |
| 5 | Well-known discovery endpoint | Done | 23390c2 |
| 6 | Auth challenge middleware | Done | 23390c2 |
| 7 | Wire everything into src/index.ts | Done | 23390c2 |

## Smoke Test Results

```
GET  /health                          → {"status":"ok"} HTTP 200
GET  /.well-known/oauth-protected-resource → {"resource":"https://example.ngrok.io","authorization_servers":["https://www.linkedin.com/oauth"]}
POST /mcp (unknown Origin)            → HTTP 403
GET  /health (known Origin)           → HTTP 200
GET  /health (no Origin)              → HTTP 200
POST /mcp (initialize, correct Accept) → {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"linkedin-mcp","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ERR_HTTP_HEADERS_SENT on MCP endpoint**
- **Found during:** Task 4 smoke test
- **Issue:** Returning `new Response(null, {status:200})` after `transport.handleRequest()` caused Hono to attempt writing response headers after the transport had already written them to rawRes
- **Fix:** Changed handler to `return;` (no Hono Response) after awaiting `transport.handleRequest()`
- **Files modified:** src/routes/mcp.ts

**2. [Rule 1 - TypeScript] exactOptionalPropertyTypes incompatibilities**
- **Found during:** Task 4 typecheck
- **Issue 1:** `{sessionIdGenerator: undefined}` not assignable — SDK uses exactOptionalPropertyTypes
- **Issue 2:** `StreamableHTTPServerTransport` onclose type mismatch vs Transport interface
- **Fix 1:** Omit sessionIdGenerator entirely (pass empty object `{}`)
- **Fix 2:** Cast transport as `unknown as Transport` for `mcpServer.connect()`
- **Files modified:** src/routes/mcp.ts

**3. [Rule 1 - TypeScript] TS7030 not all code paths return in middleware**
- **Found during:** Task 3 typecheck
- **Issue:** `originGuard` had `await next()` without return on the pass-through path
- **Fix:** Changed to `return await next()`
- **Files modified:** src/middleware/origin.ts

### Class Name Correction

The PLAN.md references `NodeStreamableHTTPServerTransport` but SDK 1.29.0 exports `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`. The class is functionally equivalent (it wraps `WebStandardStreamableHTTPServerTransport` with Node.js IncomingMessage/ServerResponse compatibility). Used `StreamableHTTPServerTransport` throughout.

## Known Stubs

| File | Stub | Reason |
|------|------|--------|
| src/mcp/server.ts | getProfile handler returns static string | Intentional — Phase 4 (TOOLS-01) wires real LinkedIn API |
| src/mcp/server.ts | postUpdate handler returns static string | Intentional — Phase 4 (TOOLS-02) wires real LinkedIn API |

## Threat Flags

None — all endpoints introduced are within the Phase 2 threat model (T-02-01 through T-02-07).

## Self-Check: PASSED

Files verified present:
- C:/OgeonX-AI/src/mcp/server.ts - FOUND
- C:/OgeonX-AI/src/middleware/origin.ts - FOUND
- C:/OgeonX-AI/src/middleware/auth-challenge.ts - FOUND
- C:/OgeonX-AI/src/routes/mcp.ts - FOUND
- C:/OgeonX-AI/src/routes/well-known.ts - FOUND

Commit 23390c2 verified in git log.
