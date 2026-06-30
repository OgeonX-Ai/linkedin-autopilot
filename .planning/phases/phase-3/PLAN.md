---
phase: 03-linkedin-oauth
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/auth/linkedin.ts
  - src/auth/session.ts
  - src/routes/auth.ts
  - src/middleware/require-auth.ts
  - src/index.ts
autonomous: true
requirements:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04
  - AUTH-05
  - AUTH-06
  - AUTH-07
  - SEC-03

must_haves:
  truths:
    - "GET /auth/login redirects to LinkedIn with scopes openid profile email w_member_social and a unique state per request"
    - "GET /auth/callback validates the state parameter, exchanges the code for tokens, and stores them in session — mismatched state returns error without storing anything"
    - "Access token and refresh token are stored only in server-side session; they never appear in logs, URLs, or response bodies"
    - "An expired access token is refreshed silently before any tool call proceeds"
    - "GET /auth/logout clears the session and all stored tokens"
    - "An unauthenticated tools/call returns a structured MCP error directing the user to /auth/login"
  artifacts:
    - path: "src/auth/session.ts"
      provides: "TypeScript types for session data"
      exports: ["SessionData", "SessionStore"]
    - path: "src/auth/linkedin.ts"
      provides: "OAuth helper functions"
      exports: ["buildAuthUrl", "exchangeCode", "refreshAccessToken"]
    - path: "src/routes/auth.ts"
      provides: "HTTP routes for login, callback, logout"
      exports: ["authRouter"]
    - path: "src/middleware/require-auth.ts"
      provides: "Middleware: validates session token, refreshes if expired, rejects if absent"
      exports: ["requireAuth"]
  key_links:
    - from: "src/routes/auth.ts (GET /auth/login)"
      to: "LinkedIn authorization URL"
      via: "buildAuthUrl() from src/auth/linkedin.ts"
      pattern: "buildAuthUrl"
    - from: "src/routes/auth.ts (GET /auth/callback)"
      to: "LinkedIn token endpoint"
      via: "exchangeCode() from src/auth/linkedin.ts"
      pattern: "exchangeCode"
    - from: "src/middleware/require-auth.ts"
      to: "src/auth/linkedin.ts"
      via: "refreshAccessToken() when session.expiresAt < Date.now()"
      pattern: "refreshAccessToken"
    - from: "src/index.ts (tools/call handler)"
      to: "src/middleware/require-auth.ts"
      via: "requireAuth middleware applied before tool dispatch"
      pattern: "requireAuth"
---

<objective>
Implement the complete LinkedIn OAuth 2.0/OIDC flow: session middleware, OAuth helper library,
auth routes (login / callback / logout), a require-auth middleware with silent token refresh,
and wiring of that middleware into the MCP tools/call handler.

Purpose: Gate every tool call behind a valid LinkedIn session. Users who have not authenticated
receive a structured MCP error with a link to /auth/login rather than a raw 401.

Output:
- src/auth/session.ts — TypeScript session data types
- src/auth/linkedin.ts — OAuth helper: buildAuthUrl, exchangeCode, refreshAccessToken
- src/routes/auth.ts — GET /auth/login, GET /auth/callback, GET /auth/logout
- src/middleware/require-auth.ts — session guard with silent refresh
- src/index.ts — updated to mount session middleware + authRouter + requireAuth on tools/call
</objective>

<execution_context>
@C:/Users/KimHarjamäki/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/KimHarjamäki/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/OgeonX-AI/.planning/PROJECT.md
@C:/OgeonX-AI/.planning/ROADMAP.md
@C:/OgeonX-AI/.planning/REQUIREMENTS.md

<interfaces>
<!-- Key environment variables this phase reads (from Phase 1). -->
<!-- LINKEDIN_CLIENT_ID     — LinkedIn OAuth app client ID (string) -->
<!-- LINKEDIN_CLIENT_SECRET — OAuth client secret (never log) -->
<!-- LINKEDIN_REDIRECT_URI  — e.g. http://localhost:3000/auth/callback -->
<!-- SESSION_SECRET         — min 32 bytes, used to sign cookies -->

<!-- LinkedIn OAuth endpoints (hardcoded constants in linkedin.ts): -->
<!-- Auth:     https://www.linkedin.com/oauth/v2/authorization -->
<!-- Token:    https://www.linkedin.com/oauth/v2/accessToken -->
<!-- UserInfo: https://api.linkedin.com/v2/userinfo -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Define session types and OAuth helper (session.ts + linkedin.ts)</name>
  <files>src/auth/session.ts, src/auth/linkedin.ts</files>
  <action>
Create src/auth/session.ts with the session data interface and a session store type.
The interface must be:

```typescript
export interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;          // Unix ms — Date.now() + expires_in * 1000
  linkedinSub: string;        // "sub" claim from ID token / userinfo
  oauthState?: string;        // ephemeral; set on login, deleted after callback validates it
}
```

Augment the express-session (or hono session) types so that `req.session` carries `SessionData | undefined`.

---

Create src/auth/linkedin.ts with three exported functions. Use Node.js built-in `fetch`
(Node 18+) — do NOT add node-fetch or axios. Read all env vars at call time (not module load),
so tests can stub them.

```typescript
const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const SCOPES    = ['openid', 'profile', 'email', 'w_member_social'];

/**
 * Returns the LinkedIn authorization URL.
 * state must be crypto.randomBytes(16).toString('hex') generated by the caller.
 */
export function buildAuthUrl(state: string): string

/**
 * POSTs to TOKEN_URL with grant_type=authorization_code.
 * Returns { accessToken, refreshToken, expiresAt, linkedinSub }.
 * Throws a typed OAuthError on non-2xx or missing fields.
 * NEVER log the raw response body.
 */
export async function exchangeCode(code: string): Promise<SessionData>

/**
 * POSTs to TOKEN_URL with grant_type=refresh_token.
 * Returns updated { accessToken, refreshToken, expiresAt }.
 * Throws OAuthError on failure.
 * NEVER log the raw response body.
 */
export async function refreshAccessToken(refreshToken: string): Promise<Pick<SessionData, 'accessToken' | 'refreshToken' | 'expiresAt'>>
```

Export a typed `OAuthError extends Error` with a `code: string` field.

buildAuthUrl implementation detail:
- Use URLSearchParams to build the query string — never string-concatenate tokens into URLs.
- Include: response_type=code, client_id, redirect_uri, scope (space-joined SCOPES), state.

exchangeCode implementation detail:
- POST with Content-Type: application/x-www-form-urlencoded.
- Body: grant_type=authorization_code, code, redirect_uri, client_id, client_secret.
- Parse JSON response. Extract access_token, refresh_token, expires_in, sub (from id_token decode or a follow-up /v2/userinfo call if sub is not present in token response).
- LinkedIn's token response does not always include sub directly; if it is absent, call GET https://api.linkedin.com/v2/userinfo with the access token to retrieve it.
- Set expiresAt = Date.now() + expires_in * 1000.

refreshAccessToken implementation detail:
- Body: grant_type=refresh_token, refresh_token, client_id, client_secret.
- Return updated tokens. If LinkedIn does not return a new refresh_token, retain the existing one (caller's responsibility to merge).
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
  src/auth/session.ts exports SessionData interface and augmented session types.
  src/auth/linkedin.ts exports buildAuthUrl, exchangeCode, refreshAccessToken, OAuthError.
  TypeScript compiles with no errors in strict mode.
  No token values or raw response bodies are passed to console.log / any logger.
  </done>
</task>

<task type="auto">
  <name>Task 2: Session middleware + auth routes (login / callback / logout)</name>
  <files>src/routes/auth.ts, src/index.ts</files>
  <action>
Install and configure cookie-based session middleware. Use `express-session` with the
`connect-sqlite3` store (or in-memory store for MVP — but make it configurable via
`SESSION_STORE=memory|sqlite`). Cookie settings:
- httpOnly: true
- secure: process.env.NODE_ENV === 'production'
- sameSite: 'lax'
- maxAge: 7 days (604800000 ms)
- secret: process.env.SESSION_SECRET (startup must have already validated this exists)

Mount this middleware BEFORE all routes in src/index.ts.

---

Create src/routes/auth.ts exporting an Express Router (or Hono router — match whatever
framework Phase 2 used) with three routes:

**GET /auth/login**
1. Generate state: `const state = crypto.randomBytes(16).toString('hex')` (per SEC-03, AUTH-02)
2. Store in session: `req.session.oauthState = state`
3. Save session explicitly before redirect to avoid race condition: `req.session.save()`
4. Redirect 302 to `buildAuthUrl(state)`
5. Log (info level): "OAuth login initiated" — NO state value in the log.

**GET /auth/callback**
1. Extract `code` and `state` from query params.
2. If `state` is missing or does not equal `req.session.oauthState` →
   clear session, respond 400 JSON `{ error: "invalid_state" }`. Do NOT call exchangeCode.
3. Delete `req.session.oauthState` (consume it — one-time use).
4. Call `exchangeCode(code)`.
5. On success: store result in session (`req.session.accessToken`, etc.), save session,
   respond 200 JSON `{ ok: true, sub: session.linkedinSub }`.
6. On OAuthError: respond 502 JSON `{ error: "token_exchange_failed", detail: err.code }`.
   Do NOT include raw error message or any token value in the response.

**GET /auth/logout**
1. Call `req.session.destroy()`.
2. Respond 200 JSON `{ ok: true }`.
3. Log (info): "Session destroyed".

Register authRouter in src/index.ts:
```typescript
import { authRouter } from './routes/auth.js';
app.use('/auth', authRouter);
```
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
  GET /auth/login redirects 302 to a LinkedIn URL containing response_type=code, client_id,
  scope=openid+profile+email+w_member_social, and a unique hex state value.
  GET /auth/callback with mismatched state returns 400 { error: "invalid_state" } without
  attempting token exchange.
  GET /auth/logout returns 200 { ok: true }.
  Session cookie is httpOnly; no token value appears in any response body or log line.
  TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 3: require-auth middleware + wire into tools/call handler</name>
  <files>src/middleware/require-auth.ts, src/index.ts</files>
  <action>
Create src/middleware/require-auth.ts. This middleware runs before the MCP tools/call
dispatcher and enforces authentication.

```typescript
export async function requireAuth(req, res, next): Promise<void>
```

Logic:
1. Check if `req.session.accessToken` exists. If not → return MCP auth error (see below).
2. Check if `req.session.expiresAt` < Date.now() + 60_000 (refresh 60 s before expiry).
   If expired/near-expiry:
   a. Call `refreshAccessToken(req.session.refreshToken)`.
   b. On success: merge new tokens into session, save session, call next().
   c. On OAuthError (refresh failed): destroy session, return MCP auth error.
3. If valid token: call next().

MCP auth error response format (AUTH-07). Return HTTP 200 with a JSON-RPC error body
so the MCP client surfaces it as a tool result, not a transport error:

```json
{
  "jsonrpc": "2.0",
  "id": "<request id from body>",
  "error": {
    "code": -32001,
    "message": "Authentication required. Please sign in at /auth/login to use LinkedIn tools."
  }
}
```

Extract the request `id` from `req.body.id` (may be null for notifications — use null).

---

Wire requireAuth into src/index.ts on the tools/call path only. Do NOT apply it globally
(login/callback/logout routes must remain unauthenticated). Apply it per-route or via a
route-level check:

```typescript
// Option A: path-based conditional (apply requireAuth only for tools/call)
app.post('/sse', (req, res, next) => {
  const body = req.body;
  if (body?.method === 'tools/call') {
    return requireAuth(req, res, next);
  }
  next();
}, mcpHandler);
```

Or equivalent middleware composition — match the pattern that Phase 2 established for
the MCP handler. Do not restructure the Phase 2 routing; add to it.
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
  requireAuth is exported from src/middleware/require-auth.ts.
  requireAuth calls refreshAccessToken when expiresAt is within 60 s of expiry.
  An unauthenticated POST /sse with method=tools/call returns HTTP 200 with
  jsonrpc error code -32001 containing a message directing to /auth/login.
  Authenticated requests with a valid unexpired session call next() without modification.
  TypeScript compiles without errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → GET /auth/callback | Query params (code, state) arrive from LinkedIn redirect; attacker can craft malicious state/code values |
| Session cookie → Server | Signed httpOnly cookie; tampering detected by signature mismatch |
| Server → LinkedIn token endpoint | Client secret sent over HTTPS; must never be logged |
| MCP client → POST /sse | JSON-RPC body with method=tools/call; unauthenticated callers must not reach tool handlers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Spoofing | GET /auth/callback — state param | mitigate | Validate req.session.oauthState === query.state before exchangeCode(); consume state immediately (one-time use) — per SEC-03 |
| T-03-02 | Tampering | Session cookie | mitigate | Sign cookie with SESSION_SECRET via express-session; httpOnly prevents JS access |
| T-03-03 | Information Disclosure | LinkedIn client secret in logs | mitigate | Never pass raw token response or client_secret to any logger; catch and re-throw typed OAuthError with code only |
| T-03-04 | Information Disclosure | Access/refresh token in URL | mitigate | Tokens stored only in server-side session; callback responds with { ok, sub } only — no token values |
| T-03-05 | Elevation of Privilege | Unauthenticated tools/call | mitigate | requireAuth middleware intercepts method=tools/call; returns JSON-RPC error -32001 before dispatch |
| T-03-06 | Denial of Service | Expired refresh token forces repeated re-auth loops | accept | Single-user MVP; loop bounded by session destroy + MCP error directing re-login |
| T-03-07 | Repudiation | No audit trail for token refresh | accept | MVP scope; logging "token refreshed for sub=<sub>" (not token value) is sufficient |
</threat_model>

<verification>
After all three tasks complete, verify end-to-end:

1. TypeScript strict compile passes:
   ```
   cd C:/OgeonX-AI && npx tsc --noEmit
   ```

2. Server starts without errors:
   ```
   cd C:/OgeonX-AI && npm run dev &
   sleep 3 && curl -s http://localhost:3000/health
   ```

3. Login redirects with correct params:
   ```
   curl -si http://localhost:3000/auth/login | grep Location
   # Must contain: response_type=code, scope=openid+profile+email+w_member_social, state=<hex>
   ```

4. Callback rejects mismatched state:
   ```
   curl -si "http://localhost:3000/auth/callback?code=FAKE&state=WRONG"
   # Must return HTTP 400 with { "error": "invalid_state" }
   ```

5. Unauthenticated tools/call returns MCP auth error:
   ```
   curl -s -X POST http://localhost:3000/sse \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"getProfile","arguments":{}}}' \
   | jq .error.code
   # Must return -32001
   ```

6. Logout clears session:
   ```
   curl -s http://localhost:3000/auth/logout
   # Must return { "ok": true }
   ```
</verification>

<success_criteria>
- AUTH-01: GET /auth/login returns 302 to LinkedIn with scopes openid profile email w_member_social and a unique hex state
- AUTH-02 + SEC-03: state is generated with crypto.randomBytes(16).toString('hex'), stored in session, validated on callback, consumed (deleted) after one use
- AUTH-03: GET /auth/callback exchanges code for tokens; mismatched state returns 400 without token exchange
- AUTH-04: Tokens in server-side session only — absent from logs, URLs, response bodies
- AUTH-05: requireAuth silently refreshes via refreshAccessToken when expiresAt < Date.now() + 60s
- AUTH-06: GET /auth/logout destroys session, returns { ok: true }
- AUTH-07: Unauthenticated tools/call returns JSON-RPC error -32001 with /auth/login link
- TypeScript strict mode: zero compile errors
</success_criteria>

<output>
After all tasks pass verification, create:
`.planning/phases/phase-3/03-01-SUMMARY.md`

Include:
- Files created/modified
- Session store choice and cookie config
- Any deviations from this plan (and why)
- Verified curl outputs for the 6 verification checks above
</output>
