# Roadmap — LinkedIn MCP Server

**Project:** LinkedIn MCP Server (OgeonX AI)
**Milestone:** MVP
**Granularity:** Standard (5-8 phases)
**Coverage:** 26/26 v1 requirements mapped

---

## Phases

- [ ] **Phase 1: Project Bootstrap** - Developer can run the server locally and build a production artifact
- [ ] **Phase 2: MCP Protocol Layer** - ChatGPT can discover, connect to, and communicate with the server via JSON-RPC over SSE
- [ ] **Phase 3: LinkedIn OAuth** - User can authenticate with LinkedIn and maintain a secure session across tool calls
- [ ] **Phase 4: LinkedIn Tools** - User can fetch their LinkedIn profile and post a text update via ChatGPT
- [ ] **Phase 5: Security Hardening** - Server enforces all security controls and never leaks credentials
- [ ] **Phase 6: Dev Experience & Docs** - Any developer can clone the repo and have a working local dev environment in under 30 minutes

---

## Phase Details

### Phase 1: Project Bootstrap
**Goal:** Developer can install dependencies, start the server on localhost:3000, and produce a compiled build artifact with a single command each.

**Depends on:** Nothing

**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, DEV-03

**Success Criteria:**
1. Running `npm install && npm run dev` starts the server on localhost:3000 with no errors
2. `GET /health` returns `{ "status": "ok" }` with HTTP 200
3. `npm run build` produces a runnable `dist/` directory with no TypeScript compile errors in strict mode
4. All secrets (LinkedIn client ID, client secret, session secret) are read from environment variables and the server refuses to start if any are missing
5. `.env.example` lists every required variable; `.env` is absent from git history

**Plans:** TBD
**UI hint:** no

---

### Phase 2: MCP Protocol Layer
**Goal:** A ChatGPT MCP client can discover the server, complete the initialize handshake, list tools, and dispatch tool calls over HTTP POST and SSE — even before any LinkedIn auth exists.

**Depends on:** Phase 1

**Requirements:** MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08

**Success Criteria:**
1. `POST /sse` accepts JSON-RPC 2.0 and returns either `application/json` or `text/event-stream` depending on the request
2. `GET /sse` opens a persistent SSE stream that stays alive and can push server-to-client events
3. Sending an `initialize` request returns `protocolVersion: "2025-06-18"`, correct `serverInfo`, and a `capabilities` object
4. Sending `tools/list` returns the full list of registered tools with name, description, and inputSchema
5. `GET /.well-known/oauth-protected-resource` returns the correct `{ resource, authorization_servers }` JSON; unauthenticated requests include `WWW-Authenticate: Bearer resource_metadata=...` header
6. Requests from unknown `Origin` headers are rejected with HTTP 403

**Plans:** TBD
**UI hint:** no

---

### Phase 3: LinkedIn OAuth
**Goal:** User can initiate LinkedIn login from the MCP server, approve the consent screen, and have tokens stored securely in session — and unauthenticated tool calls prompt re-auth gracefully.

**Depends on:** Phase 2

**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, SEC-03

**Success Criteria:**
1. `GET /auth/login` redirects to the LinkedIn authorization URL with scopes `openid profile email w_member_social` and a unique `state` parameter per request
2. `GET /auth/callback` successfully exchanges the authorization code for an access token and ID token; a mismatched or missing `state` returns an error without storing any token
3. Access and refresh tokens are stored in the server-side session — they never appear in logs, URLs, or response bodies
4. When the access token is expired, calling any tool triggers a silent refresh using the refresh token; the tool call succeeds without the user re-authenticating
5. `GET /auth/logout` clears the session and all stored tokens
6. An unauthenticated `tools/call` returns a structured MCP error message that tells the user to visit `/auth/login`

**Plans:** TBD
**UI hint:** no

---

### Phase 4: LinkedIn Tools
**Goal:** An authenticated ChatGPT user can ask for their LinkedIn profile or post a text update and get a meaningful result back — using only natural language in ChatGPT.

**Depends on:** Phase 3

**Requirements:** TOOLS-01, TOOLS-02, TOOLS-03, TOOLS-04, TOOLS-05

**Success Criteria:**
1. Invoking the `getProfile` tool returns a result containing the user's name, email, headline, and LinkedIn sub (person ID) drawn from `GET https://api.linkedin.com/v2/userinfo`
2. Invoking `postUpdate` with a valid text string creates a post on LinkedIn and returns the post ID and a URL to the post
3. Both tools expose a well-formed JSON Schema `inputSchema` that ChatGPT renders as a parameter form
4. Sending an empty string or a string over 3000 characters to `postUpdate` returns a user-readable validation error before any API call is made
5. LinkedIn API errors (401, 403, 429, 5xx) are returned as readable English messages in the MCP tool result — no stack traces or raw HTTP error objects reach the user

**Plans:** TBD
**UI hint:** no

---

### Phase 5: Security Hardening
**Goal:** The server enforces all security controls — credential isolation, header enforcement, and secret hygiene — such that no sensitive value can leak through logs, error messages, or source control.

**Depends on:** Phase 3

**Requirements:** SEC-01, SEC-02, SEC-04, SEC-05

**Success Criteria:**
1. The session secret is validated at startup to be at least 32 cryptographically random bytes loaded from the environment — startup fails with a clear message if it is not
2. The LinkedIn client secret does not appear in any log output, HTTP response, or error message under any error condition
3. All LinkedIn API calls include `Authorization: Bearer <token>` and the correct `LinkedIn-Version` header — calls missing these headers are not made
4. `.env` is present in `.gitignore` and does not appear in the git repository at any commit

**Plans:** TBD
**UI hint:** no

---

### Phase 6: Dev Experience & Docs
**Goal:** A developer unfamiliar with the project can clone the repo, follow the README, configure ngrok, and have a fully working local LinkedIn MCP integration ready to connect to ChatGPT.

**Depends on:** Phase 4, Phase 5

**Requirements:** DEV-01, DEV-02

**Success Criteria:**
1. The README contains step-by-step instructions for creating a LinkedIn app, setting required environment variables, and registering a redirect URI
2. The README explains how to start ngrok, expose localhost:3000, and update the LinkedIn app's authorized redirect URI — a developer can complete local OAuth without guessing any step
3. The README includes the ChatGPT App connector configuration (MCP endpoint URL, auth type) so a developer can connect ChatGPT to their local server

**Plans:** TBD
**UI hint:** no

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Bootstrap | 0/? | Not started | - |
| 2. MCP Protocol Layer | 0/? | Not started | - |
| 3. LinkedIn OAuth | 0/? | Not started | - |
| 4. LinkedIn Tools | 0/? | Not started | - |
| 5. Security Hardening | 0/? | Not started | - |
| 6. Dev Experience & Docs | 0/? | Not started | - |
