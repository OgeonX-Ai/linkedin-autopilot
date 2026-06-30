---
phase: 02-mcp-protocol-layer
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/mcp/server.ts
  - src/routes/mcp.ts
  - src/middleware/origin.ts
  - src/routes/well-known.ts
  - src/middleware/auth-challenge.ts
  - src/index.ts
autonomous: true
requirements:
  - MCP-01
  - MCP-02
  - MCP-03
  - MCP-04
  - MCP-05
  - MCP-06
  - MCP-07
  - MCP-08

must_haves:
  truths:
    - "POST /mcp accepts a JSON-RPC 2.0 body and returns application/json or text/event-stream (Streamable HTTP transport)"
    - "GET /mcp opens a persistent SSE stream that keeps the connection alive"
    - "initialize handshake returns protocolVersion: '2025-06-18', serverInfo, and capabilities"
    - "tools/list returns getProfile and postUpdate with name, description, and inputSchema"
    - "tools/call dispatches to the correct stub handler and returns a CallToolResult"
    - "GET /.well-known/oauth-protected-resource returns { resource, authorization_servers }"
    - "Unauthenticated requests receive a WWW-Authenticate: Bearer header in the response"
    - "Requests with an Origin not in ALLOWED_ORIGINS are rejected with HTTP 403"
    - "NodeStreamableHTTPServerTransport is used (SSEServerTransport is deprecated and ChatGPT 2025-06-18 uses Streamable HTTP)"
  artifacts:
    - path: "src/mcp/server.ts"
      provides: "McpServer instance with getProfile and postUpdate stubs registered"
      exports: ["mcpServer"]
    - path: "src/routes/mcp.ts"
      provides: "Hono route handlers for GET /mcp and POST /mcp wired to NodeStreamableHTTPServerTransport"
      exports: ["mcpRoutes"]
    - path: "src/middleware/origin.ts"
      provides: "Origin validation middleware — rejects unknown origins with 403"
      exports: ["originGuard"]
    - path: "src/routes/well-known.ts"
      provides: "GET /.well-known/oauth-protected-resource handler"
      exports: ["wellKnownRoutes"]
    - path: "src/middleware/auth-challenge.ts"
      provides: "Middleware that appends WWW-Authenticate header to 401 responses"
      exports: ["authChallenge"]
    - path: "src/index.ts"
      provides: "Application entry point — all routes and middleware wired into Hono"
  key_links:
    - from: "src/routes/mcp.ts"
      to: "src/mcp/server.ts"
      via: "imported mcpServer passed to NodeStreamableHTTPServerTransport"
      pattern: "NodeStreamableHTTPServerTransport"
    - from: "src/index.ts"
      to: "src/middleware/origin.ts"
      via: "app.use(originGuard) applied before all routes"
      pattern: "originGuard"
    - from: "src/index.ts"
      to: "src/middleware/auth-challenge.ts"
      via: "app.use(authChallenge) applied after routing"
      pattern: "authChallenge"
    - from: "src/routes/well-known.ts"
      to: "config.SERVER_URL"
      via: "response body uses SERVER_URL env var for resource and metadata URL"
      pattern: "SERVER_URL"
---

<objective>
Implement the full MCP 2025-06-18 protocol surface on top of the Hono HTTP server
produced in Phase 1. After this phase a ChatGPT MCP client can discover the server,
complete the initialize handshake, enumerate tools, and dispatch tool calls — all
before any LinkedIn OAuth wiring exists.

Purpose: Establish the MCP contract that every later phase (OAuth, tools, hardening)
builds on top of. Getting the protocol layer correct now prevents costly rework later.

Output:
- @modelcontextprotocol/sdk installed and typed
- McpServer with two registered stub tools
- GET /mcp + POST /mcp route handlers backed by NodeStreamableHTTPServerTransport (Streamable HTTP — required for ChatGPT 2025-06-18)
- Origin-guard middleware (MCP security requirement)
- /.well-known/oauth-protected-resource discovery endpoint
- WWW-Authenticate response header middleware
- All wired into src/index.ts
</objective>

<execution_context>
@C:/Users/KimHarjamäki/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/KimHarjamäki/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/OgeonX-AI/.planning/PROJECT.md
@C:/OgeonX-AI/.planning/ROADMAP.md
@C:/OgeonX-AI/.planning/REQUIREMENTS.md

## Phase 1 contract — expected artifacts from Phase 1 execution

Phase 1 (Project Bootstrap) must exist before this plan runs. The following files
are expected to have been created by Phase 1:

```
src/index.ts          — Hono app instance exported, server listening on PORT from env
src/config.ts         — Typed config object parsed from process.env; throws on missing vars
                        Expected exports:
                          export const config = {
                            PORT: number,
                            LINKEDIN_CLIENT_ID: string,
                            LINKEDIN_CLIENT_SECRET: string,
                            SESSION_SECRET: string,
                            // Phase 2 will add: ALLOWED_ORIGINS, SERVER_URL
                          }
package.json          — typescript, hono, @hono/node-server already installed
tsconfig.json         — strict mode enabled, target ES2022, module NodeNext
```

Before starting any task, verify Phase 1 artifacts exist:
```bash
ls src/index.ts src/config.ts
```
If either is missing, stop and surface the error — Phase 1 must complete first.

## MCP SDK API surface (2025-06-18 — Streamable HTTP)

⚠️ CRITICAL: SSEServerTransport is DEPRECATED. ChatGPT uses MCP 2025-06-18 which requires
NodeStreamableHTTPServerTransport (Streamable HTTP). Using the old transport means ChatGPT
will NOT connect. Use the following pattern exclusively.

Install: `npm install @modelcontextprotocol/sdk zod`

Must be >= 1.24.0 for Origin validation fix (CVE-level security requirement).

Key classes:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// Create server factory (called per-request in stateless mode)
function buildMcpServer() {
  const server = new McpServer({
    name: "linkedin-mcp",
    version: "1.0.0",
  });

  // Register a tool (inputSchema derived from zod shape)
  server.tool(
    "toolName",
    "Human-readable description",
    { param: z.string().describe("What this param is") },
    async (args) => ({
      content: [{ type: "text", text: "result text" }],
    })
  );

  return server;
}

// Streamable HTTP transport — handles both POST and GET on /mcp
// sessionIdGenerator: undefined = stateless mode (simplest for MVP)
const transport = new NodeStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,  // stateless: no session resumption
});

const server = buildMcpServer();
await server.connect(transport);

// Handle both POST (JSON-RPC requests) and GET (SSE stream)
// in the same route handler:
await transport.handleRequest(req, res, body);
```

Hono pattern with @hono/node-server:

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { IncomingMessage, ServerResponse } from "node:http";

const app = new Hono();

// Both GET and POST /mcp use the same transport handler
app.all("/mcp", async (c) => {
  // Access raw Node.js req/res via context
  const rawReq = c.env?.incoming as IncomingMessage;
  const rawRes = c.env?.outgoing as ServerResponse;

  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const mcpServer = buildMcpServer();
  await mcpServer.connect(transport);

  // Parse body for POST requests
  const body = c.req.method === "POST" ? await c.req.json() : undefined;
  await transport.handleRequest(rawReq, rawRes, body);
});

serve({ fetch: app.fetch, port: config.PORT });
```

Note: With @hono/node-server, raw IncomingMessage/ServerResponse are accessible via
c.env.incoming / c.env.outgoing. Verify property names by checking the installed
adapter's TypeScript types before assuming field names.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install SDK and extend config</name>
  <files>package.json, src/config.ts</files>
  <action>
    1. Install the MCP SDK and zod (zod is required by McpServer tool registration):
       ```
       npm install @modelcontextprotocol/sdk zod
       ```
       Confirm installed version with `npm ls @modelcontextprotocol/sdk`. The package
       must resolve without peer-dependency errors.

    2. Add two new required env vars to src/config.ts — these must throw at startup
       if missing, consistent with how Phase 1 handles LINKEDIN_CLIENT_SECRET:

       - `ALLOWED_ORIGINS`: comma-separated list of allowed Origin headers
         (e.g. `https://chat.openai.com,https://chatgpt.com`). Parse with
         `.split(",").map(s => s.trim())` to produce `string[]`.
       - `SERVER_URL`: the public base URL of this server
         (e.g. `https://abc123.ngrok.io`). Used in /.well-known response and
         WWW-Authenticate header.

       The updated config shape:
       ```typescript
       export const config = {
         // ... existing fields from Phase 1 ...
         ALLOWED_ORIGINS: string[],  // parsed from ALLOWED_ORIGINS env var
         SERVER_URL: string,          // parsed from SERVER_URL env var
       };
       ```

       Add both vars to .env.example with placeholder values:
       ```
       ALLOWED_ORIGINS=https://chat.openai.com,https://chatgpt.com
       SERVER_URL=https://your-ngrok-url.ngrok.io
       ```

    3. Confirm TypeScript still compiles with `npm run build` before proceeding.
  </action>
  <verify>
    <automated>npm run build 2>&amp;&amp; node -e "require('./dist/config.js')" || true</automated>
  </verify>
  <done>
    - `@modelcontextprotocol/sdk` appears in package.json dependencies
    - `npm run build` exits 0 with no TypeScript errors
    - src/config.ts exports ALLOWED_ORIGINS (string[]) and SERVER_URL (string)
    - .env.example contains ALLOWED_ORIGINS and SERVER_URL entries
  </done>
</task>

<task type="auto">
  <name>Task 2: Create McpServer with stub tools</name>
  <files>src/mcp/server.ts</files>
  <action>
    Create `src/mcp/server.ts`. This file owns the singleton McpServer instance and
    all tool registrations. Phase 4 will replace stub implementations with real LinkedIn
    API calls; this phase only wires the protocol surface.

    ```typescript
    import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
    import { z } from "zod";

    export const mcpServer = new McpServer({
      name: "linkedin-mcp",
      version: "1.0.0",
    });

    // getProfile — stub implementation (MCP-04, MCP-05)
    // Real implementation: Phase 4 (TOOLS-01)
    mcpServer.tool(
      "getProfile",
      "Fetch the authenticated user's LinkedIn profile: name, email, headline, and sub (person ID).",
      {}, // no input parameters for getProfile
      async (_args) => ({
        content: [
          {
            type: "text" as const,
            text: "getProfile: not implemented yet. Complete LinkedIn OAuth in Phase 3 first.",
          },
        ],
      })
    );

    // postUpdate — stub implementation (MCP-04, MCP-05)
    // Real implementation: Phase 4 (TOOLS-02, TOOLS-05)
    mcpServer.tool(
      "postUpdate",
      "Post a text update to LinkedIn on behalf of the authenticated user. Returns the post ID and URL.",
      {
        text: z
          .string()
          .min(1, "Post text cannot be empty")
          .max(3000, "Post text cannot exceed LinkedIn's 3000-character limit")
          .describe("The text content of the LinkedIn post (1–3000 characters)"),
      },
      async (_args) => ({
        content: [
          {
            type: "text" as const,
            text: "postUpdate: not implemented yet. Complete LinkedIn OAuth in Phase 3 first.",
          },
        ],
      })
    );
    ```

    Implementation notes:
    - Do NOT add any LinkedIn API calls, token reads, or session access in this file.
      This file must have zero auth dependencies — it is the protocol surface only.
    - The zod schemas for inputSchema MUST be correct now; Phase 4 only replaces the
      async handler body, not the schema.
    - Export ONLY `mcpServer`. No default export.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - src/mcp/server.ts compiles without errors
    - `mcpServer` is a named export of type McpServer
    - Two tools registered: `getProfile` (no input params) and `postUpdate` (text: string, 1–3000 chars)
    - No LinkedIn API imports or session imports in this file
  </done>
</task>

<task type="auto">
  <name>Task 3: MCP route handlers (GET /sse + POST /sse)</name>
  <files>src/routes/mcp.ts</files>
  <action>
    Create `src/routes/mcp.ts`. This file wires `mcpServer` to HTTP via
    `SSEServerTransport`. One transport instance is created per GET /sse connection
    and stored in a module-level Map for the POST handler to look up.

    ```typescript
    import { Hono } from "hono";
    import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
    import { mcpServer } from "../mcp/server.js";
    import type { IncomingMessage, ServerResponse } from "node:http";

    export const mcpRoutes = new Hono();

    // Active SSE transports keyed by sessionId
    const activeTransports = new Map<string, SSEServerTransport>();

    // GET /sse — client opens the persistent SSE stream here
    // MCP-02: must keep the connection alive and push server-to-client events
    mcpRoutes.get("/sse", async (c) => {
      // @hono/node-server exposes raw Node.js req/res on c.env
      // Type assertion is necessary because Hono's generic Env doesn't know about Node
      const rawReq = (c.env as unknown as { incoming: IncomingMessage }).incoming;
      const rawRes = (c.env as unknown as { outgoing: ServerResponse }).outgoing;

      const transport = new SSEServerTransport("/sse", rawRes);
      activeTransports.set(transport.sessionId, transport);

      transport.onclose = () => {
        activeTransports.delete(transport.sessionId);
      };

      await mcpServer.connect(transport);
      // Connection remains open — do NOT return a Hono response here.
      // SSEServerTransport owns the response lifecycle.
      return new Response(null, { status: 200 }); // Hono requires a return value; SSE transport has already taken over res
    });

    // POST /sse — client sends JSON-RPC messages here
    // MCP-01: accepts JSON-RPC 2.0, returns application/json or text/event-stream
    mcpRoutes.post("/sse", async (c) => {
      const sessionId = c.req.query("sessionId");
      if (!sessionId) {
        return c.json({ error: "Missing sessionId query parameter" }, 400);
      }

      const transport = activeTransports.get(sessionId);
      if (!transport) {
        return c.json(
          { error: `No active SSE session for sessionId: ${sessionId}` },
          400
        );
      }

      const rawReq = (c.env as unknown as { incoming: IncomingMessage }).incoming;
      const rawRes = (c.env as unknown as { outgoing: ServerResponse }).outgoing;

      await transport.handlePostMessage(rawReq, rawRes);
      // handlePostMessage writes the response directly to rawRes
      return new Response(null, { status: 200 });
    });
    ```

    IMPORTANT — Node.js adapter env key names:
    The env key names (`incoming` / `outgoing`) are the defaults for `@hono/node-server`.
    Before committing, verify by checking:
    ```bash
    node -e "const {serve} = require('@hono/node-server'); console.log(Object.keys(serve.toString()))"
    ```
    Or read `node_modules/@hono/node-server/dist/index.js` to find the actual property
    names on the env object. If different from `incoming`/`outgoing`, use the correct names.
    Common alternatives: `req`/`res` or `nodeReq`/`nodeRes`. Do not guess — check the
    installed version.

    If the SSEServerTransport constructor signature differs from what is shown above
    (e.g. it takes `(req, res)` instead of `(endpoint, res)`), read the SDK source at
    `node_modules/@modelcontextprotocol/sdk/dist/server/sse.js` and adapt accordingly.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - src/routes/mcp.ts compiles without errors
    - Exports `mcpRoutes` as a named Hono router
    - GET /sse handler creates SSEServerTransport and calls mcpServer.connect()
    - POST /sse handler looks up transport by sessionId and calls handlePostMessage()
    - activeTransports map cleans up on transport close
  </done>
</task>

<task type="auto">
  <name>Task 4: Origin-guard middleware</name>
  <files>src/middleware/origin.ts</files>
  <action>
    Create `src/middleware/origin.ts`. This middleware enforces MCP-06: all requests
    with an Origin header must match one of the values in config.ALLOWED_ORIGINS.
    Requests with an unrecognised Origin are rejected with HTTP 403. Requests with no
    Origin header (e.g. direct curl calls from the developer) are allowed through —
    the MCP security requirement targets cross-origin browser requests, not direct
    server-to-server calls.

    ```typescript
    import type { MiddlewareHandler } from "hono";
    import { config } from "../config.js";

    export const originGuard: MiddlewareHandler = async (c, next) => {
      const origin = c.req.header("origin");

      if (origin !== undefined) {
        if (!config.ALLOWED_ORIGINS.includes(origin)) {
          return c.json(
            { error: `Origin not allowed: ${origin}` },
            403
          );
        }
      }

      await next();
    };
    ```

    Notes:
    - `origin` header comparison is case-sensitive. The Origin header spec requires
      lowercase scheme and host, so exact string match is correct.
    - Do NOT trim the origin value before comparing — the browser sends the canonical form.
    - ALLOWED_ORIGINS is already a `string[]` from config (parsed in Task 1).
    - This middleware must be registered BEFORE route handlers in src/index.ts (Task 7).
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - src/middleware/origin.ts compiles without errors
    - Exports `originGuard` as MiddlewareHandler
    - Requests with unknown Origin → 403 JSON response
    - Requests with no Origin → passed through to next()
    - Requests with known Origin → passed through to next()
  </done>
</task>

<task type="auto">
  <name>Task 5: Well-known discovery endpoint</name>
  <files>src/routes/well-known.ts</files>
  <action>
    Create `src/routes/well-known.ts`. This implements MCP-07: the OAuth Protected
    Resource Metadata endpoint that ChatGPT uses to discover auth requirements.

    ```typescript
    import { Hono } from "hono";
    import { config } from "../config.js";

    export const wellKnownRoutes = new Hono();

    // MCP-07: OAuth Protected Resource Metadata
    // Spec: https://www.ietf.org/archive/id/draft-ietf-oauth-resource-metadata-08.txt
    wellKnownRoutes.get("/oauth-protected-resource", (c) => {
      return c.json({
        resource: config.SERVER_URL,
        authorization_servers: ["https://www.linkedin.com/oauth"],
      });
    });
    ```

    Notes:
    - The response must be `Content-Type: application/json` — c.json() handles this.
    - `resource` must be the exact SERVER_URL string from config (no trailing slash).
    - `authorization_servers` is an array with exactly one entry pointing to LinkedIn OAuth.
    - This route is mounted at `/.well-known` in src/index.ts, so the handler path here
      is `/oauth-protected-resource` (not the full path).
    - No authentication required on this endpoint — it is intentionally public.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - src/routes/well-known.ts compiles without errors
    - Exports `wellKnownRoutes` as a named Hono router
    - Handler returns JSON with `resource` (SERVER_URL) and `authorization_servers` array
  </done>
</task>

<task type="auto">
  <name>Task 6: WWW-Authenticate middleware</name>
  <files>src/middleware/auth-challenge.ts</files>
  <action>
    Create `src/middleware/auth-challenge.ts`. This implements MCP-08: any response
    that exits with HTTP 401 must include the WWW-Authenticate header so the MCP client
    knows where to find the OAuth metadata.

    ```typescript
    import type { MiddlewareHandler } from "hono";
    import { config } from "../config.js";

    export const authChallenge: MiddlewareHandler = async (c, next) => {
      await next();

      // After route handling: if the response is 401, append WWW-Authenticate
      if (c.res.status === 401) {
        const metadataUrl = `${config.SERVER_URL}/.well-known/oauth-protected-resource`;
        c.res.headers.set(
          "WWW-Authenticate",
          `Bearer resource_metadata="${metadataUrl}"`
        );
      }
    };
    ```

    Notes:
    - This middleware runs AFTER route handling (it calls `await next()` first, then
      inspects the response). This is the correct Hono pattern for response mutation.
    - The header value format is exactly:
      `Bearer resource_metadata="<SERVER_URL>/.well-known/oauth-protected-resource"`
      Do not change the quoting, spacing, or key name — ChatGPT parses this exactly.
    - In Phase 3, the auth middleware will return 401 for unauthenticated tool calls.
      This middleware will then automatically attach the header to those responses.
    - Register this middleware in src/index.ts AFTER originGuard but before routes, or
      as a global middleware using `app.use("*", authChallenge)` — either pattern works
      because Hono calls all middleware in sequence and this one awaits next() first.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - src/middleware/auth-challenge.ts compiles without errors
    - Exports `authChallenge` as MiddlewareHandler
    - On 401 responses: sets WWW-Authenticate header with correct Bearer resource_metadata value
    - On non-401 responses: no modification
  </done>
</task>

<task type="auto">
  <name>Task 7: Wire everything into src/index.ts</name>
  <files>src/index.ts</files>
  <action>
    Update `src/index.ts` (produced by Phase 1) to register all new middleware and
    routes created in Tasks 3–6. The middleware registration order matters:

    1. `originGuard` — must run first; blocks bad origins before any route logic
    2. `authChallenge` — must run before routes so it can observe 401 responses
    3. Routes:
       - `app.route("/sse", mcpRoutes)` — MCP protocol endpoints
       - `app.route("/.well-known", wellKnownRoutes)` — OAuth discovery

    Minimal example of the updated src/index.ts structure (preserve all existing
    Phase 1 code — health endpoint, config validation, server startup):

    ```typescript
    import { Hono } from "hono";
    import { serve } from "@hono/node-server";
    import { config } from "./config.js";
    import { originGuard } from "./middleware/origin.js";
    import { authChallenge } from "./middleware/auth-challenge.js";
    import { mcpRoutes } from "./routes/mcp.js";
    import { wellKnownRoutes } from "./routes/well-known.js";

    const app = new Hono();

    // Middleware — order is significant
    app.use("*", originGuard);
    app.use("*", authChallenge);

    // Health check (Phase 1 — do not remove)
    app.get("/health", (c) => c.json({ status: "ok" }));

    // MCP protocol endpoints (Phase 2)
    app.route("/sse", mcpRoutes);

    // OAuth discovery (Phase 2)
    app.route("/.well-known", wellKnownRoutes);

    serve(
      {
        fetch: app.fetch,
        port: config.PORT,
      },
      (info) => {
        console.log(`LinkedIn MCP server listening on port ${info.port}`);
      }
    );
    ```

    IMPORTANT: Do not blindly overwrite src/index.ts. Read the existing file first, then
    add the new imports and registrations. Preserve any Phase 1 patterns, especially how
    config validation errors are surfaced and how the server startup message is formatted.

    After updating, run the full build and start the server to confirm it starts cleanly:
    ```bash
    npm run build && ALLOWED_ORIGINS=https://chat.openai.com SERVER_URL=https://example.ngrok.io \
      LINKEDIN_CLIENT_ID=test LINKEDIN_CLIENT_SECRET=test SESSION_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
      node dist/index.js &
    sleep 2

    # Verify health still works
    curl -s http://localhost:3000/health

    # Verify well-known endpoint
    curl -s http://localhost:3000/.well-known/oauth-protected-resource

    # Verify unknown origin is rejected
    curl -s -o /dev/null -w "%{http_code}" -H "Origin: https://evil.example.com" http://localhost:3000/sse

    kill %1
    ```

    Expected results:
    - /health → `{"status":"ok"}`
    - /.well-known/oauth-protected-resource → `{"resource":"https://example.ngrok.io","authorization_servers":["https://www.linkedin.com/oauth"]}`
    - Unknown Origin on /sse → `403`
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - src/index.ts compiles without errors
    - originGuard registered before all routes
    - authChallenge registered before all routes
    - /sse routed to mcpRoutes
    - /.well-known routed to wellKnownRoutes
    - /health endpoint preserved from Phase 1
    - Server starts cleanly with required env vars set
    - Manual smoke test confirms /health, /.well-known, and 403 on unknown Origin
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Internet → POST /sse | Untrusted JSON-RPC payloads arrive here; sessionId from query param is untrusted |
| Internet → GET /sse | Any client can attempt to open an SSE stream |
| Internet → /.well-known | Public endpoint, intentionally unauthenticated |
| Origin header → originGuard | Browser-supplied; can be spoofed by non-browser clients |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Spoofing | Origin header validation | mitigate | originGuard checks against config.ALLOWED_ORIGINS allowlist; unknown origins → 403 |
| T-02-02 | Spoofing | sessionId query param on POST /sse | mitigate | Map lookup returns undefined for unknown sessionIds → 400; no session fixation possible because the server generates sessionId on GET /sse |
| T-02-03 | Denial of Service | GET /sse keeps connection alive indefinitely | accept | MVP single-user; connection limit enforcement deferred to Phase 5/infra layer |
| T-02-04 | Information Disclosure | /.well-known response reveals authorization server URL | accept | Intentional — this is the OAuth discovery spec; the URL is public information |
| T-02-05 | Elevation of Privilege | tools/call dispatches to stub handlers with no auth check | accept | Stubs return static strings; no data access. Auth gate added in Phase 3 (AUTH-07) |
| T-02-06 | Tampering | JSON-RPC payload manipulation | transfer | McpServer SDK validates JSON-RPC 2.0 structure; malformed payloads are rejected by the SDK before reaching tool handlers |
| T-02-07 | Information Disclosure | Error responses for unknown sessionId could enumerate session space | mitigate | Error message includes the rejected sessionId value only; no server state enumeration possible — the Map is in-process and the ID space is a UUID generated by the SDK |
</threat_model>

<verification>
After all tasks complete, run this full verification sequence:

```bash
# 1. Clean build
npm run build

# 2. Start server with minimal env
ALLOWED_ORIGINS=https://chat.openai.com,https://chatgpt.com \
SERVER_URL=https://example.ngrok.io \
LINKEDIN_CLIENT_ID=placeholder \
LINKEDIN_CLIENT_SECRET=placeholder \
SESSION_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
PORT=3000 \
node dist/index.js &
SERVER_PID=$!
sleep 2

# 3. Health check (Phase 1 — must still pass)
curl -sf http://localhost:3000/health | grep '"status":"ok"'

# 4. Well-known discovery (MCP-07)
curl -sf http://localhost:3000/.well-known/oauth-protected-resource \
  | grep '"authorization_servers"'

# 5. Origin guard — known origin passes (MCP-06)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Origin: https://chat.openai.com" \
  http://localhost:3000/sse
# expect: not 403

# 6. Origin guard — unknown origin blocked (MCP-06)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Origin: https://evil.example.com" \
  http://localhost:3000/health
# expect: 403

# 7. WWW-Authenticate header on 401 (MCP-08)
# Phase 3 will produce real 401s; for now confirm header logic compiles.
# (manual test: any future 401 response should contain WWW-Authenticate: Bearer resource_metadata=...)

# 8. MCP initialize handshake (MCP-03)
# Open SSE stream in one terminal, post initialize in another.
# This is a manual test requiring two concurrent connections.
# Automated version: use mcp-inspector if available:
#   npx @modelcontextprotocol/inspector http://localhost:3000/sse

kill $SERVER_PID
```
</verification>

<success_criteria>
1. `npm run build` exits 0 with strict TypeScript — no errors, no `any` escapes without comment
2. `GET /health` returns `{"status":"ok"}` with 200 (Phase 1 regression check)
3. `GET /.well-known/oauth-protected-resource` returns JSON with `resource` and `authorization_servers` keys
4. Request with unknown `Origin` header to any endpoint returns HTTP 403
5. Request with no `Origin` header passes through (developer curl workflow unblocked)
6. Request with allowed `Origin` passes through
7. `src/mcp/server.ts` registers tools `getProfile` and `postUpdate` with correct inputSchema
8. `src/routes/mcp.ts` exports `mcpRoutes` with GET /sse and POST /sse handlers
9. All new files: zero imports from Phase 3/4/5 modules (no forward dependencies)
10. TypeScript strict mode: no implicit `any`, no non-null assertion without reason comment
</success_criteria>

<output>
After all tasks complete and verification passes, create:

  C:/OgeonX-AI/.planning/phases/phase-2/phase-2-01-SUMMARY.md

Use the summary template. Key fields to populate:
- phase: "02-mcp-protocol-layer"
- plan: "01"
- status: "complete"
- artifacts_created: list all files modified (src/mcp/server.ts, src/routes/mcp.ts,
  src/middleware/origin.ts, src/routes/well-known.ts, src/middleware/auth-challenge.ts,
  src/index.ts)
- decisions: note the SSEServerTransport env key names you found in the installed adapter
  (this will help Phase 3/4 when they add more routes)
- patterns: document the Hono + SSEServerTransport wiring pattern so later phases can
  follow the same approach
</output>
