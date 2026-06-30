# Architecture Patterns — LinkedIn MCP Server

**Domain:** MCP server (TypeScript/Node.js) bridging ChatGPT to LinkedIn v2 API
**Spec:** MCP 2025-06-18 (Streamable HTTP transport)
**Researched:** 2026-06-30
**Confidence:** HIGH — derived directly from official MCP 2025-06-18 spec and SDK source

---

## Recommended Architecture

```
ChatGPT (MCP Client)
        │
        │  POST /sse          (JSON-RPC requests + notifications)
        │  GET  /sse          (SSE stream for server→client messages)
        │  DELETE /sse        (terminate session)
        ▼
┌──────────────────────────────────────────────────────────┐
│                   Express HTTP Server                     │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Transport Layer                        │ │
│  │  createMcpExpressApp + NodeStreamableHTTPTransport  │ │
│  │  - Origin header validation (DNS rebinding guard)   │ │
│  │  - MCP-Protocol-Version header enforcement          │ │
│  │  - Mcp-Session-Id assignment + routing              │ │
│  │  - SSE upgrade decision (stream vs. JSON response)  │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                    │
│  ┌──────────────────▼──────────────────────────────────┐ │
│  │              Auth Layer                             │ │
│  │  requireBearerAuth (per-request token verification) │ │
│  │  OAuthTokenVerifier → verifyAccessToken()           │ │
│  │  Session store (Mcp-Session-Id → LinkedIn tokens)   │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                    │
│  ┌──────────────────▼──────────────────────────────────┐ │
│  │              Tool Registry                          │ │
│  │  McpServer.registerTool()                           │ │
│  │  - getProfile tool                                  │ │
│  │  - postUpdate tool                                  │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                    │
│  ┌──────────────────▼──────────────────────────────────┐ │
│  │           LinkedIn API Client                       │ │
│  │  - HTTP abstraction over LinkedIn v2 REST API       │ │
│  │  - Token injection from session store               │ │
│  │  - Rate limit + error normalization                 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           OAuth Authorization Server Routes         │ │
│  │  GET  /.well-known/oauth-protected-resource         │ │
│  │  GET  /auth/authorize  (→ LinkedIn OIDC redirect)   │ │
│  │  GET  /auth/callback   (LinkedIn returns code here) │ │
│  │  POST /auth/token      (code → LinkedIn token)      │ │
│  │  POST /auth/revoke     (optional)                   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Transport Layer | SSE lifecycle, session ID assignment, protocol header enforcement, Origin validation | Auth Layer (inbound), MCP Client (outbound SSE/JSON) |
| Auth Layer | Bearer token verification per-request, 401 challenge with WWW-Authenticate, token→session lookup | Transport Layer (inbound), Session Store (read), Tool Registry (outbound on success) |
| Session Store | Maps `Mcp-Session-Id` → `{ linkedInAccessToken, linkedInRefreshToken, expiresAt }` | Auth Layer (read), OAuth Callback (write) |
| OAuth Routes | LinkedIn OIDC flow initiation, callback handling, state correlation, token storage | LinkedIn OIDC endpoints, Session Store (write), Config/Secrets |
| Tool Registry | `registerTool()` declarations + Zod schema, dispatches to LinkedIn API Client | Auth Layer (inbound with verified session), LinkedIn API Client |
| LinkedIn API Client | Wraps LinkedIn v2 REST endpoints, injects tokens, normalizes errors | Tool Registry (inbound), LinkedIn API (outbound), Session Store (token reads + refresh writes) |
| Config/Secrets | Loads env vars at startup: CLIENT_ID, CLIENT_SECRET, MCP_SERVER_URL, SESSION_SECRET, PORT | All components (read-only after init) |
| Discovery Endpoint | Serves `/.well-known/oauth-protected-resource` (RFC 9728) | MCP Client (ChatGPT reads this before auth), Config/Secrets |

---

## Data Flow: ChatGPT Request → LinkedIn → Response

```
1. ChatGPT POST /sse
   Headers: Authorization: Bearer <mcp-token>
            Mcp-Session-Id: <session-id>
            MCP-Protocol-Version: 2025-06-18
            Accept: application/json, text/event-stream
   Body:    JSON-RPC { method: "tools/call", params: { name: "getProfile" } }

2. Transport Layer
   - Validates Origin header (blocks DNS rebinding)
   - Validates MCP-Protocol-Version (400 if unsupported)
   - Routes by Mcp-Session-Id to correct session context
   - Forwards to Auth Layer

3. Auth Layer (requireBearerAuth)
   - Extracts Bearer token from Authorization header
   - Calls OAuthTokenVerifier.verifyAccessToken(token)
   - On invalid/expired → HTTP 401 + WWW-Authenticate: Bearer resource_metadata=<url>
   - On valid → enriches request context with session data (LinkedIn tokens)

4. Tool Registry dispatch
   - Identifies tool name from JSON-RPC params
   - Validates inputs against Zod schema
   - Calls tool handler with { args, sessionContext }

5. LinkedIn API Client
   - Retrieves LinkedIn access token from session context
   - If token expired → attempts refresh via LinkedIn token endpoint
   - Calls LinkedIn v2 API (e.g., GET /v2/userinfo)
   - Returns normalized result or structured error

6. Response path
   - Simple response: HTTP 200 + Content-Type: application/json
   - Streaming response: HTTP 200 + Content-Type: text/event-stream
     → SSE events until final JSON-RPC response event, then stream closes
```

---

## OAuth Callback Flow

The MCP spec (2025-06-18) treats our server as a **resource server**, not a full authorization server. However, because we are brokering LinkedIn tokens (LinkedIn is the actual AS), we must expose AS-like metadata so ChatGPT can discover how to obtain a token from us. The recommended approach:

**Our server plays dual role:**
- **Resource server** for ChatGPT (verifies our own issued tokens)
- **OAuth client** toward LinkedIn (obtains LinkedIn tokens on the user's behalf)

```
Step 1 — Discovery (ChatGPT reads our metadata)
  ChatGPT → GET /.well-known/oauth-protected-resource
  We return: {
    resource: "https://<our-domain>/sse",
    authorization_servers: ["https://<our-domain>"]
  }
  ChatGPT → GET /.well-known/oauth-authorization-server (from our domain)
  We return: {
    issuer: "https://<our-domain>",
    authorization_endpoint: "https://<our-domain>/auth/authorize",
    token_endpoint: "https://<our-domain>/auth/token",
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"]
  }

Step 2 — ChatGPT initiates authorization
  ChatGPT → GET /auth/authorize
    ?response_type=code
    &client_id=<chatgpt-registered-client-id>
    &redirect_uri=<chatgpt-callback-uri>
    &state=<chatgpt-generated-state>
    &code_challenge=<PKCE-challenge>
    &code_challenge_method=S256
    &resource=https://<our-domain>/sse

Step 3 — We redirect to LinkedIn
  Server generates its own state2 = crypto.randomUUID()
  Server stores in session store: state2 → { chatgptState, chatgptRedirectUri, chatgptClientId, codeChallenge }
  Server → 302 → LinkedIn OAuth endpoint
    ?client_id=260420654
    &redirect_uri=https://<our-domain>/auth/callback
    &state=state2
    &scope=openid profile email w_member_social

Step 4 — LinkedIn callback
  LinkedIn → GET /auth/callback?code=<linkedin-code>&state=state2
  Server:
    1. Looks up state2 in session store → retrieves { chatgptState, chatgptRedirectUri, ... }
    2. Exchanges code for LinkedIn tokens (POST to LinkedIn token endpoint)
    3. Stores LinkedIn tokens: linkedInSessionId → { accessToken, refreshToken, expiresAt, sub }
    4. Generates our own authorization code: ourCode = crypto.randomUUID()
    5. Stores: ourCode → linkedInSessionId
    6. Deletes state2 from store (one-time use)
    7. Redirects: chatgptRedirectUri?code=ourCode&state=chatgptState

Step 5 — ChatGPT exchanges code for our token
  ChatGPT → POST /auth/token
    code=ourCode, code_verifier=<PKCE-verifier>, redirect_uri=<chatgpt-redirect>
  Server:
    1. Verifies PKCE (code_verifier against stored code_challenge)
    2. Looks up ourCode → linkedInSessionId
    3. Issues our own JWT (or opaque token): mcpToken = sign({ sub: linkedInSessionId })
    4. Deletes ourCode from store
    5. Returns { access_token: mcpToken, token_type: "Bearer", expires_in: 3600 }

Step 6 — Ongoing requests
  ChatGPT → POST /sse + Authorization: Bearer mcpToken
  Server verifies mcpToken, extracts linkedInSessionId, retrieves LinkedIn tokens
```

**State correlation summary:** `state2` (server-generated UUID) is the key that binds the LinkedIn callback back to the originating ChatGPT authorization request. It is stored transiently in the session store with a short TTL (5–10 minutes). Never reuse or reissue.

---

## Session Management

**Problem:** Each ChatGPT request carries `Mcp-Session-Id` (MCP protocol session) and `Authorization: Bearer <mcpToken>` (OAuth session). These are two distinct session concepts that must be correlated.

**Recommended approach for MVP (single-user):**

```typescript
// Session store structure (in-memory for MVP, Redis for production)
interface OAuthState {
  // Transient: exists only during OAuth dance
  chatgptState: string;
  chatgptRedirectUri: string;
  chatgptClientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number; // TTL: 10 minutes
}

interface AuthCode {
  linkedInSessionId: string;
  expiresAt: number; // TTL: 2 minutes
}

interface LinkedInSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  linkedInSub: string; // LinkedIn user identifier
}

// Maps
state2 → OAuthState       // key: random UUID, TTL 10min
ourCode → AuthCode         // key: random UUID, TTL 2min
linkedInSessionId → LinkedInSession  // key: UUID, long-lived
mcpToken (sub claim) → linkedInSessionId  // derived from JWT, no storage needed
```

**MCP Session ID vs OAuth Session:** The `Mcp-Session-Id` is a transport-level concept assigned by the MCP transport layer on `InitializeResult`. It tracks the lifetime of an MCP connection. The OAuth tokens are a separate concern. The auth middleware extracts the LinkedIn session from the Bearer token, not from `Mcp-Session-Id`. These two are intentionally decoupled — a new MCP session can reuse valid OAuth tokens.

**Token refresh:** The LinkedIn API Client checks `expiresAt` before each API call. If within 5 minutes of expiry, it proactively refreshes using the stored `refreshToken` and writes the new token back to the session store.

---

## `/.well-known/oauth-protected-resource` — Required Content

Per RFC 9728 and MCP 2025-06-18 spec, this endpoint MUST be served at `GET /.well-known/oauth-protected-resource` (when the MCP endpoint is at the root) or `GET /.well-known/oauth-protected-resource/<path>` (when the endpoint has a path). The `mcpAuthMetadataRouter` from `@modelcontextprotocol/express` handles this automatically.

**Minimum required response:**
```json
{
  "resource": "https://<your-domain>/sse",
  "authorization_servers": ["https://<your-domain>"]
}
```

**Complete recommended response:**
```json
{
  "resource": "https://<your-domain>/sse",
  "authorization_servers": ["https://<your-domain>"],
  "scopes_supported": ["openid", "profile", "email", "w_member_social"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://<your-domain>/docs"
}
```

**How ChatGPT uses it:**
1. ChatGPT makes an unauthenticated request to `/sse`
2. Server responds with `HTTP 401` + `WWW-Authenticate: Bearer resource_metadata="https://<domain>/.well-known/oauth-protected-resource"`
3. ChatGPT fetches the resource metadata URL
4. Extracts `authorization_servers[0]` → appends `/.well-known/oauth-authorization-server` to discover full AS metadata
5. Uses discovered endpoints to perform OAuth 2.1 + PKCE flow

**The `requireBearerAuth` middleware from `@modelcontextprotocol/express` generates the `WWW-Authenticate` header automatically** when you pass `resourceMetadataUrl`.

---

## Folder/Module Structure

```
src/
├── index.ts                    # Entry point: creates Express app, attaches routes, starts server
│
├── server/
│   ├── app.ts                  # createMcpExpressApp setup, middleware registration
│   ├── mcpHandler.ts           # createMcpHandler factory (builds McpServer, registers tools)
│   └── sessionTransport.ts     # Stateful transport management (sessionIdGenerator, per-session store)
│
├── auth/
│   ├── tokenVerifier.ts        # OAuthTokenVerifier implementation (JWT sign/verify with our secret)
│   ├── oauthRoutes.ts          # Express router: /auth/authorize, /auth/callback, /auth/token, /auth/revoke
│   ├── metadataRoutes.ts       # mcpAuthMetadataRouter config (/.well-known/* endpoints)
│   └── pkce.ts                 # PKCE helpers: generateCodeChallenge, verifyCodeChallenge
│
├── session/
│   ├── store.ts                # In-memory store interface + implementation (Map-based with TTL)
│   ├── types.ts                # OAuthState, AuthCode, LinkedInSession, interfaces
│   └── index.ts                # Exports SessionStore singleton
│
├── tools/
│   ├── index.ts                # registerAllTools(server) — called from mcpHandler factory
│   ├── getProfile.ts           # getProfile tool: Zod schema + handler → linkedInClient.getProfile()
│   └── postUpdate.ts           # postUpdate tool: Zod schema + handler → linkedInClient.postUpdate()
│
├── linkedin/
│   ├── client.ts               # LinkedInClient class: HTTP calls to LinkedIn v2 API
│   ├── tokenManager.ts         # Token refresh logic, proactive renewal
│   └── errors.ts               # LinkedIn error types, rate limit handling, user-friendly messages
│
└── config/
    └── index.ts                # Loads + validates env vars at startup (throws if required vars missing)
```

**Environment variables (config/index.ts):**
```
LINKEDIN_CLIENT_ID          # LinkedIn app client ID (260420654)
LINKEDIN_CLIENT_SECRET      # LinkedIn app client secret
MCP_SERVER_URL              # Public URL of this server (e.g. https://abc.ngrok.io)
MCP_JWT_SECRET              # Secret for signing our own MCP access tokens
PORT                        # HTTP listen port (default 3000)
NODE_ENV                    # development | production
```

---

## Build Order (Dependencies Drive Sequence)

Build in this order — each layer depends on the one above being stable before proceeding.

**Phase 1 — Foundation (nothing depends on nothing)**
1. `config/index.ts` — env validation first; everything else needs config
2. `session/store.ts` + `session/types.ts` — pure data structures, no dependencies

**Phase 2 — Auth infrastructure (OAuth before tools)**
3. `auth/pkce.ts` — pure crypto helpers
4. `auth/tokenVerifier.ts` — depends on config (JWT secret) and session store
5. `auth/metadataRoutes.ts` — depends on config (MCP_SERVER_URL)
6. `auth/oauthRoutes.ts` — depends on config, session store, PKCE helpers; LinkedIn OAuth starts here

**Phase 3 — Transport layer**
7. `server/app.ts` — depends on auth middleware being ready
8. `server/sessionTransport.ts` — depends on session store

**Phase 4 — LinkedIn client + tools**
9. `linkedin/errors.ts` — pure error types
10. `linkedin/tokenManager.ts` — depends on session store + config
11. `linkedin/client.ts` — depends on tokenManager + errors
12. `tools/getProfile.ts` + `tools/postUpdate.ts` — depend on LinkedIn client
13. `tools/index.ts` — aggregates tools

**Phase 5 — Server wiring**
14. `server/mcpHandler.ts` — depends on tools/index.ts
15. `index.ts` — wires everything, starts listening

**Rationale for OAuth-before-tools order:** Tools cannot run without valid LinkedIn tokens. The entire OAuth flow must be provably working (verified via browser test) before tool handlers are worth building. Discovering OAuth issues late is a rewrite trigger.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Passing LinkedIn tokens directly to ChatGPT
**What goes wrong:** MCP spec section on "Token Passthrough" explicitly forbids this. The LinkedIn token is scoped to LinkedIn's AS; ChatGPT must never hold it.
**Instead:** Issue our own JWT (or opaque token) that represents a session ID. We hold LinkedIn tokens server-side and exchange them for API calls.

### Anti-Pattern 2: Storing state in the MCP session ID
**What goes wrong:** `Mcp-Session-Id` is transport-level; it can expire, reset, or not be sent. Tying auth state to it creates race conditions and token loss.
**Instead:** Decouple OAuth session (Bearer token → linkedInSessionId) from MCP session (transport keep-alive).

### Anti-Pattern 3: In-memory session store without TTL
**What goes wrong:** OAuth state objects (`state2`, `ourCode`) accumulate forever. Also, memory leaks if server runs long without restart.
**Instead:** All transient entries get a hard TTL (state2: 10 min, auth codes: 2 min). Implement a cleanup interval or use a TTL map.

### Anti-Pattern 4: Single stateless transport for all requests
**What goes wrong:** `NodeStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` creates a new server per request. Notifications, progress events, and server-initiated messages require a stateful transport keyed on `Mcp-Session-Id`.
**Instead:** For MVP, use stateful session transport: map `Mcp-Session-Id` → existing transport instance; create on first request for that session ID, reuse thereafter.

### Anti-Pattern 5: Skipping Origin header validation
**What goes wrong:** DNS rebinding attacks allow malicious web pages to probe and control the MCP server from a user's browser.
**Instead:** `createMcpExpressApp({ allowedHosts: ['your-domain.com'] })` enforces this automatically. Never skip it, even in dev (use `localhost` for dev).

---

## Scalability Considerations

| Concern | MVP (local/single user) | Production (Azure Container Apps) |
|---------|------------------------|------------------------------------|
| Session store | In-memory Map with TTL | Redis (Azure Cache for Redis) |
| Token storage | In-memory | Redis with encryption at rest |
| Transport sessions | In-memory Map | Sticky sessions or Redis pub/sub |
| TLS | ngrok terminates for dev | Azure Container Apps built-in TLS |
| Secrets | `.env` file | Azure Key Vault / Container Apps secrets |

**For MVP:** In-memory is sufficient. The single-user constraint means one active LinkedIn session. Redis becomes necessary the moment you add multiple users or horizontal scaling.

---

## Sources

- [MCP 2025-06-18 Transports Spec — Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — HIGH confidence, official spec
- [MCP 2025-06-18 Authorization Spec — RFC 9728, OAuth 2.1](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) — HIGH confidence, official spec
- [@modelcontextprotocol/typescript-sdk — server.md, express middleware](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — HIGH confidence, official SDK docs via Context7
- [Tigris: MCP OAuth man-in-the-middle pattern](https://www.tigrisdata.com/blog/mcp-oauth/) — MEDIUM confidence, community implementation reference
- [Why MCP deprecated SSE and moved to Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) — MEDIUM confidence, context for transport choice
