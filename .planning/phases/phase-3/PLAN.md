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
    - "GET /auth/callback validates the state parameter with timing-safe comparison, exchanges the code for tokens, and stores them in session — mismatched or missing state returns error without storing anything"
    - "Access token and refresh token (if present) are stored only in server-side session; they never appear in logs, URLs, or response bodies"
    - "If a refresh token is present and the access token is expired, requireAuth attempts silent refresh; if refresh fails or no refresh token exists, returns graceful MCP error directing user to re-auth"
    - "GET /auth/logout clears the session and all stored tokens"
    - "An unauthenticated tools/call returns a structured MCP error directing the user to /auth/login"
  artifacts:
    - path: "src/auth/session.ts"
      provides: "TypeScript types for session data"
      exports: ["SessionData"]
    - path: "src/auth/linkedin.ts"
      provides: "OAuth helper functions (standard authorization code, no PKCE)"
      exports: ["buildAuthUrl", "exchangeCode", "refreshAccessToken", "OAuthError"]
    - path: "src/routes/auth.ts"
      provides: "Hono routes for login, callback, logout"
      exports: ["authRoutes"]
    - path: "src/middleware/require-auth.ts"
      provides: "Hono middleware: validates session token, attempts refresh if refresh_token present, rejects gracefully if absent or refresh fails"
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
      via: "refreshAccessToken() — only called when session.refreshToken is present and token is expired"
      pattern: "refreshAccessToken"
    - from: "src/index.ts (tools/call handler)"
      to: "src/middleware/require-auth.ts"
      via: "requireAuth Hono middleware applied before tool dispatch"
      pattern: "requireAuth"

# Revision notes (2026-06-30):
# - No PKCE: LinkedIn does not enable PKCE by default; standard client_secret flow only.
#   PKCE requires a LinkedIn support request for App 260420654 — deferred to v2 if approved.
# - Refresh tokens: LinkedIn refresh tokens are a limited partner feature, not guaranteed.
#   requireAuth attempts refresh only when session.refreshToken is present; gracefully re-prompts otherwise.
# - State CSRF: comparison uses crypto.timingSafeEqual to prevent timing attacks (SEC-03).
# - Framework: Hono throughout (Phase 2 baseline). No express-session; use hono/cookie-store or
#   hono's built-in cookie helpers with signed session stored in a server-side Map (MVP).
---

<objective>
Implement the complete LinkedIn OAuth 2.0/OIDC flow using standard authorization code grant
(no PKCE — not available on this app without LinkedIn support approval). Delivers: session
store, OAuth helper library, auth routes (login / callback / logout), a require-auth Hono
middleware with best-effort silent token refresh, and wiring into the MCP tools/call handler.

Purpose: Gate every tool call behind a valid LinkedIn session. Unauthenticated callers receive
a structured JSON-RPC error with a link to /auth/login. If a refresh token is available and
the access token has expired, the middleware attempts silent refresh before failing.

Constraints:
- Standard authorization code grant only (client_secret, no PKCE)
- Refresh tokens may not be issued by LinkedIn for this app tier; treat as optional
- Hono framework throughout (matches Phase 2)
- Scopes: openid profile email w_member_social (ONLY — old scopes return 401)

Output:
- src/auth/session.ts — TypeScript session data types
- src/auth/linkedin.ts — OAuth helper: buildAuthUrl, exchangeCode, refreshAccessToken, OAuthError
- src/routes/auth.ts — GET /auth/login, GET /auth/callback, GET /auth/logout (Hono handlers)
- src/middleware/require-auth.ts — Hono session guard with best-effort refresh
- src/index.ts — updated to mount session store + authRoutes + requireAuth on tools/call
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
<!-- Key environment variables this phase reads (validated at startup in Phase 1). -->
<!-- LINKEDIN_CLIENT_ID     — LinkedIn OAuth app client ID (string) -->
<!-- LINKEDIN_CLIENT_SECRET — OAuth client secret (never log) -->
<!-- LINKEDIN_REDIRECT_URI  — e.g. http://localhost:3000/auth/callback -->
<!-- SESSION_SECRET         — min 32 bytes, used to sign session cookies -->

<!-- LinkedIn OAuth endpoints (constants in linkedin.ts): -->
<!-- Auth:     https://www.linkedin.com/oauth/v2/authorization -->
<!-- Token:    https://www.linkedin.com/oauth/v2/accessToken -->
<!-- UserInfo: https://api.linkedin.com/v2/userinfo -->

<!-- Framework: Hono (from Phase 2). All route handlers are Hono Context handlers. -->
<!-- Session: server-side Map keyed by signed session ID cookie (MVP). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Define session types and OAuth helper (session.ts + linkedin.ts)</name>
  <files>src/auth/session.ts, src/auth/linkedin.ts</files>
  <action>
Create src/auth/session.ts with the session data interface:

```typescript
export interface SessionData {
  accessToken: string;
  refreshToken?: string;        // Optional — LinkedIn may not issue one for this app tier
  expiresAt: number;            // Unix ms: Date.now() + expires_in * 1000
  linkedinSub: string;          // "sub" claim from userinfo
  oauthState?: string;          // Ephemeral CSRF token; deleted after callback validates it
}

// Server-side in-memory session store (MVP — replace with Redis/SQLite for production)
export const sessionStore = new Map<string, SessionData>();
```

---

Create src/auth/linkedin.ts with the following. Use Node.js built-in fetch (Node 18+).
Read all env vars at call time (not at module load) so tests can stub them.
No PKCE — standard authorization code grant with client_secret only.

```typescript
const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
// ONLY these scopes — old scopes (r_liteprofile, r_emailaddress) return 401 immediately
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

export class OAuthError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
```

**buildAuthUrl(state: string): string**
- Build with `new URLSearchParams()` — never string-concatenate credentials into URLs.
- Params: response_type=code, client_id, redirect_uri, scope (SCOPES.join(' ')), state.
- Return `${AUTH_URL}?${params.toString()}`.
- No code_challenge / code_verifier (PKCE not enabled on this app).

**exchangeCode(code: string): Promise<SessionData>**
- POST to TOKEN_URL with Content-Type: application/x-www-form-urlencoded.
- Body params: grant_type=authorization_code, code, redirect_uri, client_id, client_secret.
- On non-2xx: throw new OAuthError('token_request_failed', 'LinkedIn token request failed').
  Do NOT include the response body text in the error message or any log.
- Parse JSON response. Extract: access_token, refresh_token (may be absent), expires_in.
- To get linkedinSub: call GET USERINFO_URL with Authorization: Bearer <access_token>.
  Parse the userinfo JSON and extract the `sub` field.
- Return:
  ```typescript
  {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,  // may be undefined — that is fine
    expiresAt: Date.now() + data.expires_in * 1000,
    linkedinSub: userinfo.sub,
  }
  ```

**refreshAccessToken(refreshToken: string): Promise<Pick<SessionData, 'accessToken' | 'refreshToken' | 'expiresAt'>>**
- POST to TOKEN_URL, body: grant_type=refresh_token, refresh_token, client_id, client_secret.
- On non-2xx: throw new OAuthError('refresh_failed', 'LinkedIn token refresh failed').
  Do NOT log response body.
- Return updated { accessToken, refreshToken (new value or existing if not returned), expiresAt }.
- Note: If LinkedIn does not return a new refresh_token in the response, the caller must
  retain the old one. Document this in a JSDoc comment on the function.
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
  src/auth/session.ts exports SessionData (refreshToken optional) and sessionStore.
  src/auth/linkedin.ts exports buildAuthUrl, exchangeCode, refreshAccessToken, OAuthError.
  buildAuthUrl uses URLSearchParams with no PKCE params.
  SCOPES constant is exactly ['openid', 'profile', 'email', 'w_member_social'].
  TypeScript compiles with zero errors in strict mode.
  No token values or raw response bodies passed to any logger.
  </done>
</task>

<task type="auto">
  <name>Task 2: Session cookie store + Hono auth routes (login / callback / logout)</name>
  <files>src/routes/auth.ts, src/index.ts</files>
  <action>
Session store design (MVP, Hono-compatible):
- Use the `sessionStore` Map from src/auth/session.ts.
- Session ID: `crypto.randomUUID()` stored as a signed httpOnly cookie named `sid`.
- Cookie signing: HMAC-SHA256 with SESSION_SECRET. Sign as `${id}.${hmac(id, secret)}`.
  Verify by re-computing HMAC and comparing with crypto.timingSafeEqual.
- Helper functions (can be in src/auth/session.ts or a new src/auth/cookie.ts):
  ```typescript
  export function signSessionId(id: string): string
  export function verifySessionId(signed: string): string | null  // returns raw id or null
  export function getSession(c: Context): SessionData | undefined
  export function setSession(c: Context, id: string, data: SessionData): void
  export function destroySession(c: Context): void
  ```
- getSession: reads `sid` cookie, verifies signature, looks up sessionStore, returns data or undefined.
- setSession: writes signed `sid` cookie with httpOnly=true, sameSite=lax,
  secure=(NODE_ENV==='production'), maxAge=604800 (7 days), and upserts sessionStore.
- destroySession: deletes from sessionStore, clears the cookie (maxAge=0).

No express-session, no connect-sqlite3. The in-memory Map is sufficient for single-user MVP.

---

Create src/routes/auth.ts as a Hono app (or router) exported as `authRoutes`:

```typescript
import { Hono } from 'hono';
export const authRoutes = new Hono();
```

**GET /login**  (mounted at /auth — becomes /auth/login in index.ts)
1. Generate CSRF state:
   ```typescript
   const state = crypto.randomBytes(16).toString('hex');
   ```
2. Create a fresh session and store state in it:
   ```typescript
   const sessionId = crypto.randomUUID();
   const sessionData: Partial<SessionData> = { oauthState: state };
   setSession(c, sessionId, sessionData as SessionData);
   ```
3. Redirect 302 to buildAuthUrl(state).
4. Log (info): "OAuth login initiated" — do NOT log the state value itself.

**GET /callback**  (becomes /auth/callback)
1. Extract `code` and `state` from c.req.query().
2. Load current session via getSession(c). If no session: return 400 { error: 'no_session' }.
3. Timing-safe state comparison (SEC-03 — must use timingSafeEqual, not ===):
   ```typescript
   import { timingSafeEqual } from 'node:crypto';

   const storedState = session.oauthState ?? '';
   const incomingState = (c.req.query('state') ?? '');
   const storedBuf  = Buffer.from(storedState,  'utf8');
   const incomingBuf = Buffer.from(incomingState, 'utf8');

   // Buffers must be same length for timingSafeEqual; if not, reject immediately.
   const stateValid = storedBuf.length > 0
     && storedBuf.length === incomingBuf.length
     && timingSafeEqual(storedBuf, incomingBuf);
   ```
   If !stateValid: destroySession(c), return 400 JSON { error: 'invalid_state' }.
   Do NOT call exchangeCode.
4. Delete oauthState from session (one-time use — consume before any await):
   session.oauthState = undefined;
5. Call exchangeCode(code).
6. On success: store full token data in session via setSession(c, existingId, mergedData).
   Return 200 JSON { ok: true, sub: mergedData.linkedinSub }.
7. On OAuthError: log 'token exchange failed: ' + err.code (not err.message, not token data).
   Return 502 JSON { error: 'token_exchange_failed', detail: err.code }.

**GET /logout**  (becomes /auth/logout)
1. destroySession(c).
2. Return 200 JSON { ok: true }.
3. Log (info): "Session destroyed".

Mount in src/index.ts:
```typescript
import { authRoutes } from './routes/auth.js';
app.route('/auth', authRoutes);
```
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
  GET /auth/login redirects 302 to a LinkedIn URL with response_type=code, scope containing
  exactly the four approved scopes, and a unique hex state.
  GET /auth/callback with mismatched state returns 400 { error: 'invalid_state' } and does not
  call exchangeCode. State comparison uses crypto.timingSafeEqual (not string ===).
  GET /auth/logout returns 200 { ok: true } and clears the session cookie.
  No token value appears in any response body, log line, or URL.
  TypeScript compiles with zero errors.
  </done>
</task>

<task type="auto">
  <name>Task 3: requireAuth Hono middleware + wire into tools/call handler</name>
  <files>src/middleware/require-auth.ts, src/index.ts</files>
  <action>
Create src/middleware/require-auth.ts exporting a Hono middleware factory:

```typescript
import type { MiddlewareHandler } from 'hono';
export const requireAuth: MiddlewareHandler = async (c, next) => { ... };
```

Logic (in order):

1. Load session via getSession(c). If no session or no accessToken:
   return mcpAuthError(c, requestId(c)).

2. Check expiry with 60-second buffer:
   ```typescript
   const nearExpiry = session.expiresAt < Date.now() + 60_000;
   ```

3. If nearExpiry:
   a. If session.refreshToken is present:
      - Call refreshAccessToken(session.refreshToken).
      - On success: merge new tokens into session (retain old refreshToken if new one not returned),
        call setSession to persist, then call next().
      - On OAuthError: log 'token refresh failed: ' + err.code.
        destroySession(c). Return mcpAuthError(c, requestId(c)).
   b. If session.refreshToken is absent (LinkedIn did not issue one for this app tier):
      - Log (info): 'Access token expired; no refresh token available — re-auth required'.
      - destroySession(c). Return mcpAuthError(c, requestId(c)).

4. If token is valid (not nearExpiry): call next().

Helper functions (define in this file):

```typescript
function requestId(c: Context): string | number | null {
  // Parse body to extract JSON-RPC id; return null for notifications or parse failures
  try {
    const body = c.get('body') ?? {};  // assume body-parser has already run
    return (body as Record<string, unknown>).id ?? null;
  } catch { return null; }
}

function mcpAuthError(c: Context, id: string | number | null): Response {
  return c.json({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32001,
      message: 'Authentication required. Please sign in at /auth/login to use LinkedIn tools.',
    },
  }, 200);  // HTTP 200 — MCP error is in the JSON-RPC body, not the HTTP status
}
```

---

Wire requireAuth into src/index.ts on the tools/call path only. The /auth/* routes must
remain unauthenticated. Do not apply requireAuth globally.

Hono pattern — apply inline middleware on the MCP POST handler:

```typescript
import { requireAuth } from './middleware/require-auth.js';

// Inside the POST /sse handler (or equivalent from Phase 2):
app.post('/sse', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  c.set('body', body);  // cache parsed body so requireAuth can read it

  if (body?.method === 'tools/call') {
    // Run requireAuth inline — returns early with MCP error if not authed
    let authPassed = false;
    await requireAuth(c, async () => { authPassed = true; });
    if (!authPassed) return c.res;  // requireAuth already wrote the response
  }

  return mcpHandler(c, body);  // existing Phase 2 MCP dispatch
});
```

Match the exact routing structure Phase 2 established. Do not restructure Phase 2 routes —
only add the requireAuth guard inside the existing tools/call dispatch path.
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
  requireAuth is exported from src/middleware/require-auth.ts as a Hono MiddlewareHandler.
  When session.refreshToken is absent and token is expired: session is destroyed and MCP
  auth error -32001 is returned (no crash, no unhandled promise rejection).
  When session.refreshToken is present and refresh succeeds: next() is called, tool proceeds.
  When session.refreshToken is present and refresh fails (OAuthError): session destroyed,
  MCP auth error returned.
  An unauthenticated POST /sse with method=tools/call returns HTTP 200 with
  jsonrpc error code -32001 containing the /auth/login message.
  TypeScript compiles with zero errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser -> GET /auth/callback | Query params (code, state) arrive from LinkedIn redirect; attacker can forge state values |
| Session cookie -> Server | Signed httpOnly cookie; tampering or forgery detected by HMAC verification |
| Server -> LinkedIn token endpoint | Client secret transmitted over HTTPS; must never appear in logs |
| MCP client -> POST /sse | JSON-RPC body with method=tools/call; unauthenticated callers must not reach tool handlers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Spoofing | GET /auth/callback — state param | mitigate | crypto.timingSafeEqual comparison of session.oauthState vs query.state (equal-length check first); consume state after first use — per SEC-03 |
| T-03-02 | Tampering | Session cookie (sid) | mitigate | HMAC-SHA256 signed with SESSION_SECRET; verifySessionId rejects invalid signatures via timingSafeEqual |
| T-03-03 | Information Disclosure | LinkedIn client_secret in logs | mitigate | OAuthError carries only err.code; raw response bodies and client_secret are never passed to any logger |
| T-03-04 | Information Disclosure | Access/refresh token in URL or response body | mitigate | Tokens stored in server-side Map only; callback returns { ok, sub } — no token values; no token in redirect URLs |
| T-03-05 | Elevation of Privilege | Unauthenticated tools/call | mitigate | requireAuth checks session before tool dispatch; returns JSON-RPC -32001 without calling tool handler |
| T-03-06 | Spoofing | Session fixation via crafted sid cookie | mitigate | New sessionId (crypto.randomUUID()) generated on login; old ID cannot be pre-set by attacker to fix the session |
| T-03-07 | Denial of Service | No refresh token -> repeated re-auth on every expiry | accept | Single-user MVP; token lifetime is typically 60 days on LinkedIn; re-auth loop is bounded and surfaced clearly |
| T-03-08 | Repudiation | No audit trail for refresh attempts | accept | MVP scope; err.code logged on failure ("token refresh failed: <code>") provides minimal forensic trail |
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

3. Login redirects with correct params (no code_challenge, correct scopes):
   ```
   curl -si http://localhost:3000/auth/login | grep -i location
   # Location must contain:
   #   response_type=code
   #   scope=openid+profile+email+w_member_social  (exact, no old scopes)
   #   state=<32-char hex>
   #   NO code_challenge param
   ```

4. Callback rejects mismatched state:
   ```
   curl -si "http://localhost:3000/auth/callback?code=FAKE&state=WRONG"
   # Must return HTTP 400 with { "error": "invalid_state" }
   ```

5. Unauthenticated tools/call returns MCP auth error (HTTP 200, error code -32001):
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
- AUTH-01: GET /auth/login returns 302 to LinkedIn with scopes openid profile email w_member_social and unique hex state; no PKCE params present
- AUTH-02 + SEC-03: state is crypto.randomBytes(16).toString('hex'), stored server-side, validated with crypto.timingSafeEqual (timing-safe), consumed (deleted) after first use
- AUTH-03: GET /auth/callback exchanges code for tokens; mismatched or missing state returns 400 without token exchange
- AUTH-04: Tokens in server-side Map only — absent from logs, URLs, response bodies
- AUTH-05: requireAuth attempts refresh only when session.refreshToken is present; if absent or refresh fails, returns MCP auth error -32001 directing user to /auth/login (graceful — no crash)
- AUTH-06: GET /auth/logout destroys session and clears cookie, returns { ok: true }
- AUTH-07: Unauthenticated tools/call returns HTTP 200 JSON-RPC error code -32001 with /auth/login message
- TypeScript strict mode: zero compile errors
- No PKCE code_challenge in auth URL (LinkedIn does not enable PKCE by default for this app)
</success_criteria>

<output>
After all tasks pass verification, create:
`.planning/phases/phase-3/03-01-SUMMARY.md`

Include:
- Files created/modified
- Session store implementation choice (in-memory Map, signed cookie)
- Whether LinkedIn returned a refresh_token during local testing (record actual behaviour)
- Any deviations from this plan and why
- Verified curl outputs for the 6 verification checks above
</output>
