# Architecture

## System diagram

```
  ┌────────────────────────────────────────────────────────────────────┐
  │                        ChatGPT (Custom GPT)                        │
  └──────────────────────────────┬──────────────┬──────────────────────┘
                                 │              │
             1. OAuth authorize  │              │  4. POST /mcp
             GET /oauth/authorize│              │     Authorization: Bearer <JWT>
                                 ▼              ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                        OgeonX MCP Server (Hono)                          │
  │                                                                          │
  │   ┌─────────────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
  │   │   OAuth AS routes   │   │  MCP routes  │   │  Routine routes      │ │
  │   │  /oauth/authorize   │   │  GET  /mcp   │   │  /routine/token      │ │
  │   │  /oauth/callback    │   │  POST /mcp   │   │  /routine/post-*     │ │
  │   │  /oauth/token       │   └──────┬───────┘   └────────┬─────────────┘ │
  │   └──────────┬──────────┘          │                    │               │
  │              │                requireAuth            verifyJwt           │
  │              │             (Bearer JWT → sessionId)  (Bearer JWT)        │
  │              │                     │                    │               │
  │              │                     ▼                    ▼               │
  │              │            ┌────────────────────────────────────────┐    │
  │              │            │         Session Store (in-memory Map)  │    │
  │              │            │  sessionId → { accessToken, expiresAt, │    │
  │              │            │               linkedinSub, ... }       │    │
  │              │            └────────────────────────────────────────┘    │
  │              │                     │                                    │
  │              │                     ▼                                    │
  │              │            ┌────────────────┐                            │
  │              │            │  Tool handlers │                            │
  │              │            │  src/tools/    │                            │
  │              │            └───────┬────────┘                            │
  │              │                    │ linkedinFetch()                     │
  │              ▼                    ▼                                     │
  │   ┌──────────────────┐   ┌───────────────────┐                         │
  │   │  LinkedIn OAuth  │   │  LinkedIn API v2   │                         │
  │   │  /oauth/v2/auth  │   │  /v2/userinfo      │                         │
  │   │  /oauth/v2/token │   │  /v2/posts         │                         │
  │   └──────────────────┘   └───────────────────┘                         │
  └──────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │  .sessions.json  │  (persisted to disk every 5 min + on SIGINT/SIGTERM)
           └──────────────────┘
```

---

## Component breakdown

### `src/auth/`

Owns all authentication primitives. Nothing in this directory makes network calls.

| File | Responsibility |
|------|---------------|
| `cookie.ts` | HMAC-signed HttpOnly cookie: `setSession()`, `getSession()`, `getSessionId()` |
| `jwt.ts` | `signJwt(sessionId, expiresInSeconds)` and `verifyJwt(token)` using HMAC-SHA256 |
| `linkedin.ts` | `generateState()` for CSRF, `exchangeCode()` for authorization code → token exchange |
| `session.ts` | `SessionData` type + in-memory `sessionStore` Map + 15-minute expiry cleanup timer |
| `session-persist.ts` | `loadSessions()` on startup, `saveSessions()` to `.sessions.json` |
| `user-registry.ts` | Multi-user `.users.json` registry: load, save, lookup by LinkedIn sub |

### `src/linkedin/`

The only place in the codebase that calls the LinkedIn API.

| File | Responsibility |
|------|---------------|
| `client.ts` | `linkedinFetch()` enforced wrapper (always sets auth + version headers); `LinkedInClient` class with `getProfile()`, `createPost()`, `createArticlePost()`; `LinkedInApiError` with static error messages |

**Invariant:** No file outside `src/linkedin/` may call `fetch()` with a `linkedin.com` URL.
All LinkedIn API calls must go through `linkedinFetch()`.

### `src/mcp/`

| File | Responsibility |
|------|---------------|
| `server.ts` | `buildMcpServer(sessionId)` — registers all eight tools with Zod input schemas. Session is resolved from `sessionStore` at call time, not at server build time. |

### `src/middleware/`

Middleware is registered in a specific order in `src/index.ts` — do not reorder without
understanding the interaction between them.

| File | Order | Responsibility |
|------|-------|---------------|
| `origin.ts` | First (before routes) | Block requests with disallowed `Origin` headers |
| `auth-challenge.ts` | After routes | Annotate 401 responses with `WWW-Authenticate: Bearer` |
| `require-auth.ts` | Per-route | Verify Bearer JWT and attach `sessionId` to context |
| `sanitize-errors.ts` | Last (`app.onError`) | Redact `LINKEDIN_CLIENT_SECRET` from error messages |

### `src/routes/`

| File | Mount point | Auth |
|------|-------------|------|
| `landing.ts` | `GET /` | None |
| `auth.ts` | `/auth/*` | None (browser-facing OAuth initiation) |
| `oauth.ts` | `/oauth/*` | None (OAuth AS for ChatGPT) |
| `mcp.ts` | `/mcp` | `requireAuth` (Bearer JWT) |
| `routine.ts` | `/routine/*` | Inline `verifyJwt` check on every handler |
| `admin.ts` | `/admin/*` | `ADMIN_SECRET` Bearer check |
| `well-known.ts` | `/.well-known/*` | None (RFC 8615 discovery) |

### `src/tools/`

Each file exports a single `*Handler` function. Handlers are pure in the sense that they
receive all dependencies (session data) as arguments — no global state access. This makes
them straightforward to unit test with mocked LinkedIn clients.

### `src/config.ts`

Validates required environment variables at startup and exits with a clear message if any
are missing or malformed (e.g., `SESSION_SECRET` shorter than 32 characters). In test
environments (`NODE_ENV=test`, `VITEST=true`), config validation is skipped so tests can
set their own environment.

---

## Authentication flow (ChatGPT OAuth)

This is the complete step-by-step sequence for a first-time ChatGPT connection:

```
1.  User opens Custom GPT and triggers an action that requires LinkedIn.

2.  ChatGPT → GET /oauth/authorize?response_type=code&client_id=...&redirect_uri=<chatgpt_uri>&state=<chatgpt_state>

3.  Server stores { redirectUri, chatgptState } under a random authReqId in pendingAuthRequests.

4.  Server redirects → LinkedIn /oauth/v2/authorization
    state = <linkedinRandom>.<authReqId>   (authReqId encoded in state for callback recovery)

5.  User logs in to LinkedIn and grants consent.

6.  LinkedIn → GET /oauth/callback?code=<linkedin_code>&state=<linkedinRandom>.<authReqId>

7.  Server extracts authReqId from state, looks up pendingAuthRequests, recovers { redirectUri, chatgptState }.

8.  Server calls LinkedIn POST /oauth/v2/accessToken → receives { accessToken, expiresAt, linkedinSub }.

9.  Server creates a session: sessionId = crypto.randomUUID()
    sessionStore.set(sessionId, { accessToken, expiresAt, linkedinSub })
    saveSessions() is called immediately.

10. Server issues a short-lived authorization code:
    authCode = crypto.randomBytes(32).toString("hex")  (expires in 5 minutes)
    authCodes.set(authCode, { sessionId, expiresAt })

11. Server → redirects ChatGPT to <redirectUri>?code=<authCode>&state=<chatgptState>

12. ChatGPT → POST /oauth/token  body: grant_type=authorization_code&code=<authCode>

13. Server verifies authCode, deletes it (single-use), and issues a JWT:
    jwt = signJwt(sessionId, 3600)   (1-hour expiry)

14. Server → { access_token: jwt, token_type: "Bearer", expires_in: 3600 }

15. ChatGPT stores the JWT and uses it as Authorization: Bearer <jwt> on all /mcp requests.

16. requireAuth middleware verifies JWT signature + expiry → extracts sessionId.
    sessionStore.get(sessionId) → SessionData with accessToken.

17. Tool handler is called with { accessToken, linkedinSub } from session.
    LinkedIn API call is made via linkedinFetch().
```

---

## Routine authentication flow

Scheduled routines (cron jobs, Claude agents) use a separate 30-day JWT:

```
1.  User authenticates via browser: GET /auth/login → LinkedIn OAuth → cookie set.

2.  User visits GET /routine/token (browser, authenticated by cookie).
    Server issues: signJwt(sessionId, 30 * 24 * 60 * 60)

3.  User copies the JWT and embeds it in their scheduled task:
    Authorization: Bearer <30-day-jwt>

4.  Scheduled task → POST /routine/post-ai-news (or /post-thought-leadership, /post-weekly-roundup)
    with Authorization: Bearer <jwt>

5.  Route handler calls verifyJwt() → extracts sessionId.
    sessionStore.get(sessionId) → { accessToken, linkedinSub }

6.  postAINewsHandler (or equivalent) is called directly — no MCP protocol involved.

7.  Response: { ok: true, message: "Posted: ..." }
```

---

## Data flow for a post

Trace of a `postUpdate` tool call from ChatGPT through to the LinkedIn API:

```
ChatGPT
  → POST /mcp  Authorization: Bearer <jwt>
    body: { method: "tools/call", params: { name: "postUpdate", arguments: { text: "Hello LinkedIn!" } } }

requireAuth middleware
  → verifyJwt(jwt) → { sub: sessionId }
  → sessionStore.get(sessionId) → { accessToken, linkedinSub, ... }

src/mcp/server.ts  buildMcpServer(sessionId).tool("postUpdate")
  → postUpdateHandler({ text: "Hello LinkedIn!" }, { accessToken, linkedinSub })

src/tools/post-update.ts  postUpdateHandler()
  → authorUrn = "urn:li:person:" + linkedinSub
  → new LinkedInClient().createPost(accessToken, authorUrn, text)

src/linkedin/client.ts  LinkedInClient.createPost()
  → linkedinFetch("https://api.linkedin.com/v2/posts", accessToken, { method: "POST", body: ... })
    headers: Authorization, LinkedIn-Version: 202501, X-Restli-Protocol-Version: 2.0.0

LinkedIn API
  → HTTP 201 Created
    x-linkedin-id: urn:li:share:1234567890

LinkedInClient.createPost() returns
  → { postId: "urn:li:share:1234567890", postUrl: "https://www.linkedin.com/feed/update/urn:li:share:1234567890/" }

postUpdateHandler returns
  → { isError: false, content: [{ type: "text", text: "Posted successfully! View at: https://www.linkedin.com/feed/update/..." }] }

ChatGPT receives
  → MCP tool result with the post URL
```

---

## Session lifecycle

```
Server startup
  └─ loadSessions()
       reads .sessions.json → populates sessionStore Map

OAuth callback (GET /oauth/callback or /auth/callback)
  └─ sessionStore.set(sessionId, { accessToken, expiresAt, linkedinSub, ... })
  └─ saveSessions()  ← immediate persist (session survives instant restart)

Every 5 minutes (setInterval in src/index.ts)
  └─ saveSessions()  ← periodic persist

SIGINT / SIGTERM signal handlers (src/index.ts)
  └─ saveSessions()
  └─ process.exit(0)

Every 15 minutes (setInterval in src/auth/session.ts)
  └─ purgeExpiredSessions()
       removes sessions where expiresAt < Date.now() - 1 hour
       (1-hour grace period allows verifyJwt to return its own expiry error first)
```

---

## Why no database

Sessions and user registry are stored in JSON files on disk (`.sessions.json`,
`.users.json`). This is an intentional design choice for zero-infrastructure self-hosting:

- No Docker container, no Redis, no Postgres, no connection strings to manage.
- A single `npm start` on a $5 VPS or local machine is sufficient.
- Cloudflare Tunnel provides TLS and a stable public URL without opening firewall ports.

**Scaling limit:** This design works reliably for a single Node.js process serving up to
~100 concurrent users. Beyond that, the in-memory session store requires sticky-session
load balancing or replacement with a shared store.

**Upgrade path when scaling is needed:**

1. Replace `sessionStore` (Map) with a Redis client call in `src/auth/session.ts`.
2. Replace `.users.json` with a Postgres/SQLite table in `src/auth/user-registry.ts`.
3. Remove `session-persist.ts` — it is no longer needed when using an external store.
4. No changes required to tools, routes, or middleware.
