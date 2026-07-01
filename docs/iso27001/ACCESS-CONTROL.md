# Access Control Policy

**Document ID:** ISMS-ACC-001
**Version:** 1.0
**Date:** 2026-07-02
**Owner:** Kim Harjamäki (kim.harjamaki@prosimo.fi)
**Classification:** Internal
**Standard:** ISO/IEC 27002:2022 A.8.2, A.8.3, A.8.5

---

## 1. Access Control Model

OgeonX LinkedIn Autopilot uses a **session-indirection model**: AI agents and browsers never hold raw LinkedIn OAuth tokens. Instead, they hold session references (JWTs, signed cookies, or API keys) that resolve to a server-side session containing the LinkedIn credentials.

```
AI Agent / Browser
     |
     |  (JWT Bearer / API Key / signed cookie)
     v
OgeonX Server  ——  requireAuth middleware  ——  sessionStore (in-memory Map)
                                                     |
                                              { accessToken, refreshToken,
                                                expiresAt, linkedinSub }
                                                     |
                                              LinkedIn API v2
```

This design ensures that a compromised AI agent or intercepted network response never directly yields a LinkedIn token.

---

## 2. Authentication Methods

Three authentication methods are supported. The `requireAuth` middleware evaluates them in priority order on every request to a protected route.

### 2.1 Method 1 — JWT Bearer Token (ChatGPT, Google Agentspace)

**When used:** Remote AI agents that complete a full OAuth flow (ChatGPT Actions, Google Agentspace connectors)

**Mechanism:**
1. Agent redirects user to `GET /oauth/authorize`
2. User authenticates with LinkedIn; server exchanges code for LinkedIn tokens
3. Server issues a short-lived auth code to the agent (5-minute TTL, 256 bits of entropy)
4. Agent exchanges auth code for a JWT at `POST /oauth/token`
5. Agent includes JWT in subsequent requests: `Authorization: Bearer <token>`

**JWT properties:**
- Algorithm: HS256 (HMAC-SHA256)
- Signing key: `SESSION_SECRET`
- Claims: `sub` (sessionId), `iat` (issued at), `exp` (expiry)
- Verification: `crypto.timingSafeEqual` to prevent timing-based signature forgery
- The JWT `sub` is the server-side `sessionId`, not the LinkedIn `sub` — the server resolves `sessionId` → `SessionData` → LinkedIn tokens

**Token lifetime from `/oauth/token`:** 3600 seconds (1 hour)
**Token lifetime from `/routine/token`:** 30 days (for long-running agent configurations)

**Source:** `src/auth/jwt.ts`, `src/routes/oauth.ts`

---

### 2.2 Method 2 — API Key (n8n, Zapier, direct HTTP clients)

**When used:** Automation platforms and direct HTTP integrations that do not support full OAuth flows

**Mechanism:**
- Client includes `X-API-Key: <key>` header on every request
- Server compares against each key in `config.apiKeys` array using `crypto.timingSafeEqual`
- On match, the server resolves the session associated with the API key holder

**API key properties:**
- Stored as comma-separated list in `API_KEYS` environment variable
- No per-key expiry; rotation requires updating `API_KEYS` in `.env` and restarting the server
- Keys are never returned in any HTTP response

**Recommended key format:** 32+ random bytes, hex-encoded (64 characters) — use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

### 2.3 Method 3 — Signed Session Cookie (Browser flow)

**When used:** Human users authenticating via the web interface at `/auth/login`

**Mechanism:**
1. User visits `/auth/login`; server redirects to LinkedIn OAuth
2. After LinkedIn callback, server creates a session (`crypto.randomUUID()`) and stores it in `sessionStore`
3. Server sets a signed `sid` cookie: `${sessionId}.${HMAC-SHA256(sessionId, SESSION_SECRET)}`
4. Subsequent browser requests include the cookie automatically

**Cookie properties:**
- Name: `sid`
- Value: `${sessionId}.${hmac}` (URL-encoded)
- `HttpOnly` — inaccessible to JavaScript; mitigates XSS token theft
- `SameSite=Lax` — prevents cross-site submission in most attack scenarios
- `Secure` — set in production environments (HTTPS only)
- `Max-Age=604800` — 7-day browser retention
- Verification uses `timingSafeEqual` on the full signed value

**Source:** `src/auth/cookie.ts`

---

## 3. Privilege Levels

| Level | Who | Routes Accessible | Controls |
|---|---|---|---|
| **Anonymous** | Any unauthenticated client | `GET /` (landing page), `GET /auth/login`, `GET /auth/callback`, `GET /oauth/authorize`, `GET /oauth/callback`, `POST /oauth/token` | None — public routes |
| **Authenticated** | Clients with valid JWT, API key, or signed session cookie | All MCP tools (`POST /mcp`), `GET /routine/token`, `GET /profile` | `requireAuth` middleware |
| **Admin** | Clients with valid `X-Admin-Secret` header | `GET /admin/users` | Separate `requireAdmin` check; `ADMIN_SECRET` env var |

### 3.1 Authenticated Privilege Details

An authenticated session grants access to all implemented MCP tools:
- `getProfile` — read the authenticated user's LinkedIn profile
- `postUpdate` — post text update to LinkedIn
- `getRecentCommits` — read local git repository commits
- `postAINews` — fetch AI news feeds and post a curated update
- `postArticle` — post a link share with commentary
- `searchJobs` — search Remotive.io and Indeed for jobs
- `postThoughtLeadership` — compose and post thought leadership content
- `postWeeklyRoundup` — compose and post a weekly roundup
- `updateCompanyPage` — post to a LinkedIn company/organization page

An authenticated session is always scoped to the LinkedIn account of the user who completed the OAuth flow. Cross-user access is not possible: `linkedinSub` is always read from the server-side session, never from caller-supplied arguments.

### 3.2 Admin Privilege Details

The `GET /admin/users` endpoint returns a list of all registered users from `.users.json`. Fields returned: `linkedinSub`, `name`, `email`, `createdAt`, `lastActiveAt`. No OAuth tokens or secrets are included in the response.

Admin privilege is completely separate from user authentication: holding a valid JWT does not grant admin access, and holding `ADMIN_SECRET` does not grant LinkedIn posting access.

---

## 4. Token Lifecycle

| Token / Credential | Issued By | Lifetime | Storage Location | Revocation |
|---|---|---|---|---|
| LinkedIn access token | LinkedIn OAuth server | ~60 days (varies by LinkedIn policy) | Server-side: `sessionStore` + `.sessions.json` | Delete session entry; or revoke via LinkedIn Developer Portal |
| LinkedIn refresh token | LinkedIn OAuth server | Indefinite until revoked | Server-side: `sessionStore` + `.sessions.json` | Revoke via LinkedIn Developer Portal; or delete `.sessions.json` entry |
| Routine JWT (agent config) | `/routine/token` endpoint | 30 days | AI agent configuration | Rotate `SESSION_SECRET` (invalidates all JWTs); or remove entry from agent config |
| ChatGPT session JWT | `/oauth/token` endpoint | 1 hour | AI agent (ChatGPT stores it) | Rotate `SESSION_SECRET`; or wait for natural expiry |
| OAuth auth code | `/oauth/callback` | 5 minutes | Server-side: `authCodes` Map | Single-use; deleted immediately on redemption; auto-expires |
| Session cookie | `/auth/callback` | 7 days browser retention; server session is indefinite | Browser cookie jar | Call `/auth/logout` to destroy server session and clear cookie |
| API key | Static in `.env` | Indefinite | `.env` file | Remove from `API_KEYS` and restart server |
| Admin secret | Static in `.env` | Indefinite | `.env` file | Update `ADMIN_SECRET` and restart server |

### 4.1 Session Cleanup

Expired sessions (where `expiresAt` is more than 1 hour in the past) are purged from `sessionStore` by an interval timer that runs every 15 minutes. The timer is created with `.unref()` so it does not prevent process shutdown.

`.sessions.json` is rewritten on every mutation; stale entries in the file from previous runs are loaded on startup and subsequently purged by the cleanup timer.

---

## 5. Token Revocation Procedures

### 5.1 Revoking a Single User Session (routine)
1. Identify the user's `linkedinSub` from `.users.json`
2. Find their `sessionId` entry in `.sessions.json`
3. Delete that entry from `.sessions.json`
4. Restart the server to reload the file, or wait for the next cleanup cycle

### 5.2 Emergency: Revoke All Sessions
1. Delete `.sessions.json`: `rm .sessions.json`
2. Restart the server — all users must re-authenticate
3. Optionally rotate `SESSION_SECRET` in `.env` to invalidate all outstanding JWTs and cookies simultaneously

### 5.3 Revoking API Keys
1. Edit `API_KEYS` in `.env` to remove the compromised key
2. Restart the server — the key is immediately invalid

### 5.4 Rotating SESSION_SECRET
1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `SESSION_SECRET` in `.env`
3. Restart the server
4. Effect: all existing JWTs and session cookies are invalidated; users must re-authenticate; `.sessions.json` entries remain but new JWTs will be issued against new sessions

### 5.5 Revoking LinkedIn Application Access
1. Log in to [LinkedIn Developer Portal](https://developer.linkedin.com)
2. Navigate to the application settings
3. Rotate the client secret or revoke the application entirely
4. Update `LINKEDIN_CLIENT_SECRET` in `.env`
5. All existing LinkedIn access tokens issued to users may still be valid until their natural expiry; revoke them individually at LinkedIn if needed

---

## 6. Least Privilege: LinkedIn API Scopes

The application requests only the scopes necessary for its declared functions:

| Scope | Purpose | Requested |
|---|---|---|
| `openid` | OpenID Connect — enables `/v2/userinfo` endpoint | Yes |
| `profile` | Read user's name and profile photo via OIDC | Yes |
| `email` | Read user's email address via OIDC | Yes |
| `w_member_social` | Post updates to the authenticated user's feed | Yes |
| `w_organization_social` | Post updates to organization pages | Yes |
| `r_organization_social` | Read organization page content | Yes |
| `rw_organization_admin` | Manage organization page settings | Yes |
| `r_member_social` | Read the user's own posts and activity | **Not requested** |
| `r_liteprofile` | Legacy profile read (deprecated) | **Not requested** |
| `r_emailaddress` | Legacy email read (deprecated) | **Not requested** |

`r_member_social` is deliberately not requested: the application does not need to read the user's posting history, and requesting it would expand the permission surface without benefit.

The deprecated scopes `r_liteprofile` and `r_emailaddress` are not used; the application uses the OIDC `profile` and `email` scopes which are the current LinkedIn standard.

---

## 7. API Key Management

### 7.1 Generating an API Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This produces a 64-character hexadecimal string with 256 bits of entropy, which is computationally infeasible to brute-force.

### 7.2 Configuring API Keys

Add one or more comma-separated keys to `.env`:

```
API_KEYS=<key1>,<key2>,<key3>
```

Restart the server after adding keys. Each key grants equal access to all authenticated endpoints.

### 7.3 Rotating API Keys

1. Generate a new key using the command above
2. Add the new key to `API_KEYS` alongside the existing key (support both during transition)
3. Update all clients to use the new key
4. Remove the old key from `API_KEYS`
5. Restart the server

### 7.4 Revoking an API Key

Remove the key from `API_KEYS` in `.env` and restart the server. The key is immediately rejected on the next request after restart.

### 7.5 API Key Security Requirements

- Minimum recommended length: 32 bytes (64 hex characters)
- Must not be shared across multiple integrations; issue one key per integration
- Never commit keys to version control
- Rotate annually or immediately upon suspected compromise
- Store in integration platform's secure credentials store, not in plain text configuration

---

## 8. Review History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-02 | Kim Harjamäki | Initial access control policy |
