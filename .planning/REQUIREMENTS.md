# Requirements — LinkedIn MCP Server

**Project:** LinkedIn MCP Server (OgeonX AI)
**Version:** v1 MVP
**Date:** 2026-06-30

---

## v1 Requirements

### INFRA — Server Infrastructure

- [ ] **INFRA-01**: Developer can bootstrap the project with `npm install && npm run dev` and see the MCP server running on localhost:3000
- [ ] **INFRA-02**: Server reads all secrets (LinkedIn client ID, client secret, session secret) from environment variables — no hardcoded values
- [ ] **INFRA-03**: `.env.example` file documents all required environment variables
- [ ] **INFRA-04**: TypeScript compiles without errors with strict mode enabled
- [ ] **INFRA-05**: Server has a health-check endpoint `GET /health` returning `{ status: "ok" }`

### MCP — MCP Protocol Implementation

- [ ] **MCP-01**: Server exposes `POST /sse` endpoint that accepts JSON-RPC 2.0 requests and returns `Content-Type: application/json` or `text/event-stream`
- [ ] **MCP-02**: Server exposes `GET /sse` endpoint that opens a persistent SSE stream for server-to-client messages
- [ ] **MCP-03**: Server responds to MCP `initialize` handshake with correct `serverInfo`, `protocolVersion: "2025-06-18"`, and `capabilities`
- [ ] **MCP-04**: Server responds to `tools/list` with all registered tool schemas (name, description, inputSchema)
- [ ] **MCP-05**: Server responds to `tools/call` by dispatching to the correct tool handler and returning a `CallToolResult`
- [ ] **MCP-06**: Server validates `Origin` header on all incoming requests and rejects unknown origins with 403
- [ ] **MCP-07**: Server exposes `GET /.well-known/oauth-protected-resource` returning `{ resource: "<server-url>", authorization_servers: ["https://www.linkedin.com/oauth"] }`
- [ ] **MCP-08**: Server returns `WWW-Authenticate: Bearer resource_metadata="<url>/.well-known/oauth-protected-resource"` on unauthenticated requests

### AUTH — LinkedIn OAuth 2.0 / OIDC

- [ ] **AUTH-01**: Server exposes `GET /auth/login` that redirects user to LinkedIn authorization URL with correct scopes (`openid`, `profile`, `email`, `w_member_social`)
- [ ] **AUTH-02**: OAuth flow uses state parameter (CSRF protection) — state is validated on callback
- [ ] **AUTH-03**: Server exposes `GET /auth/callback` that exchanges authorization code for LinkedIn access token + ID token
- [ ] **AUTH-04**: Server stores access token and refresh token securely in session (not logged, not in URL)
- [ ] **AUTH-05**: Server handles token refresh when access token is expired — transparent to tool callers
- [ ] **AUTH-06**: User can `GET /auth/logout` to clear their session and tokens
- [ ] **AUTH-07**: Unauthenticated tool calls return a structured MCP error prompting the user to authenticate via `/auth/login`

### TOOLS — LinkedIn MCP Tools

- [ ] **TOOLS-01**: `getProfile` tool calls `GET https://api.linkedin.com/v2/userinfo` and returns `{ name, email, headline, sub }` as MCP tool result content
- [ ] **TOOLS-02**: `postUpdate` tool accepts `{ text: string }` input, calls `POST https://api.linkedin.com/v2/ugcPosts` with correct UGC body, and returns the created post ID and URL
- [ ] **TOOLS-03**: Both tools include well-formed JSON Schema `inputSchema` that ChatGPT can use to prompt for parameters
- [ ] **TOOLS-04**: Tools return user-readable error messages for all LinkedIn API error codes (401, 403, 429, 5xx)
- [ ] **TOOLS-05**: `postUpdate` validates that text is non-empty and under LinkedIn's 3000-character limit before calling the API

### SEC — Security

- [ ] **SEC-01**: Session secret is cryptographically random (min 32 bytes) and loaded from environment
- [ ] **SEC-02**: LinkedIn client secret never appears in logs, responses, or error messages
- [ ] **SEC-03**: OAuth state parameter is unique per login request and validated on callback (CSRF)
- [ ] **SEC-04**: All LinkedIn API calls include correct `Authorization: Bearer <token>` and `LinkedIn-Version` headers
- [ ] **SEC-05**: `.env` file is in `.gitignore` — never committed

### DEV — Developer Experience

- [ ] **DEV-01**: README documents: LinkedIn App setup, environment variables, local dev with ngrok, ChatGPT App connector config
- [ ] **DEV-02**: Local dev works with ngrok tunnel — README explains how to register the ngrok URL as LinkedIn redirect URI
- [ ] **DEV-03**: `npm run build` produces a runnable `dist/` output

---

## v2 Requirements (Deferred)

- Events Management tools (`createEvent`, `listEvents`) — provisioned but deferred
- Image/video post support via LinkedIn media upload API
- Multi-user / tenant token store (Redis or Postgres)
- Azure Container Apps deployment config (Dockerfile, bicep/terraform)
- Post analytics tool (`getPostAnalytics`)
- LinkedIn company page posting support
- Rate limit retry with exponential backoff

---

## Out of Scope

- Job search / apply — LinkedIn Partner API, not approved for this app
- Network invites / connection management — Partner API only
- Private messaging — Partner API only
- Marketing / Ads APIs — separate LinkedIn product, not approved
- Image/video media posts — v2 only; text posts first
- Multi-tenant user management — single-user MVP first

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 1: Project Bootstrap | Pending |
| INFRA-02 | Phase 1: Project Bootstrap | Pending |
| INFRA-03 | Phase 1: Project Bootstrap | Pending |
| INFRA-04 | Phase 1: Project Bootstrap | Pending |
| INFRA-05 | Phase 1: Project Bootstrap | Pending |
| DEV-03 | Phase 1: Project Bootstrap | Pending |
| MCP-01 | Phase 2: MCP Protocol Layer | Pending |
| MCP-02 | Phase 2: MCP Protocol Layer | Pending |
| MCP-03 | Phase 2: MCP Protocol Layer | Pending |
| MCP-04 | Phase 2: MCP Protocol Layer | Pending |
| MCP-05 | Phase 2: MCP Protocol Layer | Pending |
| MCP-06 | Phase 2: MCP Protocol Layer | Pending |
| MCP-07 | Phase 2: MCP Protocol Layer | Pending |
| MCP-08 | Phase 2: MCP Protocol Layer | Pending |
| AUTH-01 | Phase 3: LinkedIn OAuth | Pending |
| AUTH-02 | Phase 3: LinkedIn OAuth | Pending |
| AUTH-03 | Phase 3: LinkedIn OAuth | Pending |
| AUTH-04 | Phase 3: LinkedIn OAuth | Pending |
| AUTH-05 | Phase 3: LinkedIn OAuth | Pending |
| AUTH-06 | Phase 3: LinkedIn OAuth | Pending |
| AUTH-07 | Phase 3: LinkedIn OAuth | Pending |
| SEC-03 | Phase 3: LinkedIn OAuth | Pending |
| TOOLS-01 | Phase 4: LinkedIn Tools | Pending |
| TOOLS-02 | Phase 4: LinkedIn Tools | Pending |
| TOOLS-03 | Phase 4: LinkedIn Tools | Pending |
| TOOLS-04 | Phase 4: LinkedIn Tools | Pending |
| TOOLS-05 | Phase 4: LinkedIn Tools | Pending |
| SEC-01 | Phase 5: Security Hardening | Pending |
| SEC-02 | Phase 5: Security Hardening | Pending |
| SEC-04 | Phase 5: Security Hardening | Pending |
| SEC-05 | Phase 5: Security Hardening | Pending |
| DEV-01 | Phase 6: Dev Experience & Docs | Pending |
| DEV-02 | Phase 6: Dev Experience & Docs | Pending |
