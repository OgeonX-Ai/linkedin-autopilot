# Risk Assessment and Treatment Plan

**Document ID:** ISMS-RISK-001
**Version:** 1.0
**Date:** 2026-07-02
**Owner:** Kim Harjamäki (kim.harjamaki@prosimo.fi)
**Classification:** Internal
**Methodology:** ISO/IEC 27001:2022 Annex A; qualitative scoring (Likelihood 1–5, Impact 1–5, Risk Score = L × I)

---

## 1. Risk Scoring Guide

| Score | Likelihood | Impact |
|---|---|---|
| 1 | Very unlikely (theoretical) | Negligible — no real harm |
| 2 | Unlikely (requires specific conditions) | Minor — limited effect |
| 3 | Possible (known attack vector exists) | Moderate — partial data exposure or service disruption |
| 4 | Likely (common attack, low effort) | Significant — credential exposure or unauthorized actions |
| 5 | Almost certain (actively exploited) | Severe — full account takeover, regulatory breach |

**Risk appetite:** Residual scores above 12 require immediate mitigation. Scores 8–12 require documented treatment. Scores below 8 are acceptable.

---

## 2. Risk Register

---

### RISK-001: LinkedIn OAuth Token Theft via .sessions.json

| Field | Value |
|---|---|
| **Asset** | `.sessions.json` — persisted LinkedIn access and refresh tokens |
| **Threat** | Attacker reads file from host filesystem (local or remote) |
| **Vulnerability** | Tokens stored in plaintext JSON on disk; any process with filesystem read access can extract them |
| **Likelihood** | 2 — requires host compromise or physical access |
| **Impact** | 5 — tokens allow posting to LinkedIn as the victim; refresh token permits indefinite access |
| **Gross Risk Score** | 10 |

**Current controls:**
- Tokens stored server-side only; never sent to MCP clients or AI agents
- `.sessions.json` should be excluded from version control via `.gitignore`
- Session cleanup runs every 15 minutes purging expired sessions (in-memory); file is rewritten on changes
- LinkedIn access tokens expire after approximately 60 days; refresh tokens can be revoked via LinkedIn developer portal

**Residual risk:** 8 (filesystem access still yields valid tokens until expiry)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Document that `.sessions.json` must never be committed (`git status` check in deployment runbook)
2. Future: encrypt token values at rest using a derived key
3. Implement LinkedIn token revocation on user logout

---

### RISK-002: LinkedIn Client Secret Exposure via .env File

| Field | Value |
|---|---|
| **Asset** | `.env` — `LINKEDIN_CLIENT_SECRET` |
| **Threat** | Secret committed to version control, exposed in CI/CD logs, or read by unauthorized process |
| **Vulnerability** | Flat file credential storage; no secrets manager |
| **Likelihood** | 2 — requires deliberate git add or log inspection |
| **Impact** | 5 — attacker can impersonate the application, issue tokens to arbitrary users |
| **Gross Risk Score** | 10 |

**Current controls:**
- `config.ts` validates the secret is present at startup but never logs its value
- `sanitizeErrors` middleware in Hono redacts `LINKEDIN_CLIENT_SECRET` from all error responses
- `.env` must be in `.gitignore` (enforced by documented policy in SECURITY.md)
- LinkedIn client secret can be rotated via LinkedIn Developer Portal without changing the application's other secrets

**Residual risk:** 6 (residual risk is .gitignore misconfiguration or log scraping)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Pre-commit hook to block `git add .env` (add to CONTRIBUTING.md)
2. Annual rotation of `LINKEDIN_CLIENT_SECRET`

---

### RISK-003: SESSION_SECRET Compromise Enabling JWT Forgery

| Field | Value |
|---|---|
| **Asset** | `SESSION_SECRET` — HMAC key for JWT and session cookie signing |
| **Threat** | Attacker obtains `SESSION_SECRET` and forges session cookies or JWTs |
| **Vulnerability** | Single symmetric key used for both cookie HMAC-SHA256 and JWT HS256; compromise enables arbitrary session creation |
| **Likelihood** | 2 — requires `.env` access or memory dump |
| **Impact** | 5 — complete authentication bypass for all users |
| **Gross Risk Score** | 10 |

**Current controls:**
- `config.ts` enforces minimum length of 32 characters at startup; process exits if shorter
- `SESSION_SECRET` is never logged or returned in any response
- JWT verification uses `crypto.timingSafeEqual` to prevent timing-based secret recovery
- Cookie verification likewise uses `crypto.timingSafeEqual`

**Residual risk:** 6 (risk is limited to host-level compromise)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Annual rotation of `SESSION_SECRET` (invalidates all active sessions — users re-authenticate)
2. Minimum recommended entropy: 64 characters (alphanum + symbols) documented in setup guide

---

### RISK-004: Unauthorized API Access via Missing or Weak Authentication

| Field | Value |
|---|---|
| **Asset** | MCP tool endpoints, LinkedIn posting capability |
| **Threat** | Unauthenticated caller invokes `postUpdate` or other tools |
| **Vulnerability** | If `requireAuth` middleware is bypassed or misconfigured, any caller can post to LinkedIn |
| **Likelihood** | 2 — middleware is applied at router level; misconfiguration risk during development |
| **Impact** | 4 — unauthorized LinkedIn posts; reputation damage |
| **Gross Risk Score** | 8 |

**Current controls:**
- `requireAuth` middleware applied to all MCP and routine endpoints
- Three authentication paths checked in priority order: (1) `Authorization: Bearer <JWT>`, (2) `X-API-Key` header against `API_KEYS`, (3) signed `sid` session cookie
- Session tokens are resolved from server-side store by `sessionId`; the AI agent never holds a raw LinkedIn token
- LinkedIn `sub` is always read from the server-side session, not from agent-supplied arguments

**Residual risk:** 4

**Treatment decision:** Mitigate
**Treatment actions:**
1. Automated test coverage for `requireAuth` middleware (verify 401 on all tool endpoints without credentials)
2. Penetration test route enumeration annually

---

### RISK-005: Shell Injection via repoPath Parameter in getRecentCommits

| Field | Value |
|---|---|
| **Asset** | Host operating system; server process |
| **Threat** | Attacker passes a crafted `repoPath` value containing shell metacharacters to execute arbitrary commands |
| **Vulnerability** | `getRecentCommits` tool accepts a `repoPath` parameter and runs git commands against it |
| **Likelihood** | 3 — MCP tool arguments are controllable by the connected AI agent or direct HTTP caller |
| **Impact** | 5 — arbitrary code execution on host; full server compromise |
| **Gross Risk Score** | 15 |

**Current controls:**
- `repoPath` is validated to be an absolute path before use
- `spawnSync` is used with `shell: false` (array args, not string interpolation) to prevent shell injection
- Path traversal sequences (`..`) are rejected by path validation

**Residual risk:** 6 (validated absolute path with shell:false mitigates primary vector)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Add explicit allowlist of permitted repo paths or require path to exist and be a git repository before execution
2. Consider removing `repoPath` parameter entirely in favor of server-configured path only

---

### RISK-006: CSRF in OAuth Flow via State Parameter

| Field | Value |
|---|---|
| **Asset** | LinkedIn OAuth authorization code; user session |
| **Threat** | Attacker crafts a malicious authorization URL and tricks user's browser into initiating OAuth flow that binds to attacker's session |
| **Vulnerability** | OAuth authorization code flow is susceptible to CSRF if state parameter is not validated |
| **Likelihood** | 2 — requires social engineering or XSS on a trusted page |
| **Impact** | 4 — account takeover if attacker can complete the callback with a victim's code |
| **Gross Risk Score** | 8 |

**Current controls:**
- `generateState()` produces 32 hex characters (16 bytes) via `crypto.randomBytes` — cryptographically unpredictable
- State stored in session before redirect; callback validates incoming state matches stored value
- For the ChatGPT OAuth flow (`/oauth/authorize`), state is encoded as `<linkedinRandom>.<authReqId>` where `authReqId` maps to a server-side `pendingAuthRequests` map entry; unknown `authReqId` values are rejected
- Pending auth requests are deleted on first use (one-time)

**Residual risk:** 4

**Treatment decision:** Accept (controls are comprehensive; residual risk is low)

---

### RISK-007: Tunnel URL Hijacking via Cloudflare trycloudflare.com

| Field | Value |
|---|---|
| **Asset** | `LINKEDIN_REDIRECT_URI`; OAuth callback integrity |
| **Threat** | Cloudflare free tunnel URL changes on restart; an attacker registers the old URL and receives OAuth callbacks |
| **Vulnerability** | `trycloudflare.com` subdomains are ephemeral and may be reassigned after the tunnel is stopped |
| **Likelihood** | 2 — requires restart of tunnel and attacker awareness of old URL |
| **Impact** | 4 — LinkedIn OAuth codes delivered to attacker |
| **Gross Risk Score** | 8 |

**Current controls:**
- LinkedIn Developer Portal restricts valid redirect URIs to the explicitly registered list; LinkedIn will not redirect to an unregistered URI
- Cloudflare Tunnel can be configured with a persistent custom domain (recommended for production)

**Residual risk:** 4 (LinkedIn's redirect URI whitelist is the primary control)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Configure persistent Cloudflare Tunnel with a custom domain for production use
2. Update LinkedIn Developer Portal redirect URI to the custom domain before going live with multiple users

---

### RISK-008: Session Fixation

| Field | Value |
|---|---|
| **Asset** | User session; LinkedIn access token |
| **Threat** | Attacker plants a known session ID in the victim's browser before authentication; after authentication, victim's session is elevated and attacker can use the known ID |
| **Vulnerability** | If session ID is not regenerated after successful OAuth callback, the pre-auth session ID may be reused |
| **Likelihood** | 2 — requires attacker to control victim's cookie |
| **Impact** | 4 — attacker inherits authenticated session |
| **Gross Risk Score** | 8 |

**Current controls:**
- Each successful OAuth callback creates a new session ID via `crypto.randomUUID()` — the session ID is always fresh, never pre-assigned by the client
- Session IDs are server-generated; clients cannot supply or predict them
- Session cookie is HttpOnly and SameSite=Lax, preventing JavaScript access and cross-site submission

**Residual risk:** 3

**Treatment decision:** Accept (crypto.randomUUID() generation at callback time makes fixation structurally impossible)

---

### RISK-009: LinkedIn Account Suspension via Rate Limiting

| Field | Value |
|---|---|
| **Asset** | User's LinkedIn account; LinkedIn API access |
| **Threat** | AI agent posts excessively, triggering LinkedIn's automated abuse detection and suspending the account or revoking API access |
| **Vulnerability** | MCP tools do not enforce a posting rate limit; a runaway agent could call `postUpdate` in a tight loop |
| **Likelihood** | 3 — AI agent loops are a known failure mode |
| **Impact** | 3 — LinkedIn account suspension, loss of API access |
| **Gross Risk Score** | 9 |

**Current controls:**
- LinkedIn API enforces its own rate limits server-side; excessive calls result in 429 responses
- Post content validators enforce minimum and maximum length (1–3000 characters), preventing trivial spam
- Tool descriptions document intended usage (one post per use)

**Residual risk:** 6

**Treatment decision:** Mitigate
**Treatment actions:**
1. Implement server-side rate limiter (e.g., token bucket: max 3 posts per 24 hours per `linkedinSub`)
2. Log all post attempts with timestamp for audit trail

---

### RISK-010: RSS Feed Injection via Malicious Content in News Feeds

| Field | Value |
|---|---|
| **Asset** | LinkedIn posts authored by the user; user's professional reputation |
| **Threat** | A malicious actor compromises TechCrunch, MIT Tech Review, O'Reilly, or Remotive feeds and injects content that is then posted to LinkedIn |
| **Vulnerability** | Feed content is fetched over HTTPS but its contents are passed to AI for summarization without strict sanitization |
| **Likelihood** | 1 — compromising major tech publishers is highly unlikely |
| **Impact** | 3 — inappropriate content posted to user's LinkedIn profile |
| **Gross Risk Score** | 3 |

**Current controls:**
- Feeds fetched from established, reputable sources (TechCrunch, MIT Tech Review, O'Reilly, Remotive.io, Indeed)
- Content is passed to AI models for summarization; AI adds a layer of filtering
- LinkedIn post content is not executed — it is plain text

**Residual risk:** 2

**Treatment decision:** Accept

---

### RISK-011: Admin Endpoint Exposure (/admin/users)

| Field | Value |
|---|---|
| **Asset** | `.users.json` data — names, emails, LinkedIn sub identifiers |
| **Threat** | Attacker accesses `/admin/users` to enumerate all registered users |
| **Vulnerability** | Admin endpoint exposes PII; if `ADMIN_SECRET` is weak or absent, endpoint is effectively public |
| **Likelihood** | 3 — endpoint is reachable via Cloudflare Tunnel |
| **Impact** | 4 — PII exposure; potential GDPR violation |
| **Gross Risk Score** | 12 |

**Current controls:**
- `/admin/users` requires `X-Admin-Secret` header matching `ADMIN_SECRET` environment variable
- `config.ts` reads `ADMIN_SECRET` from environment; defaults to empty string (which means the endpoint would effectively be unprotected if `ADMIN_SECRET` is not set)
- Response includes only `linkedinSub`, `name`, `email`, `createdAt`, `lastActiveAt` — no raw tokens

**Residual risk:** 8 (risk is that `ADMIN_SECRET` defaults to empty if not configured)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Add startup check: if `ADMIN_SECRET` is empty string, either refuse to start or disable the admin endpoint entirely
2. Minimum `ADMIN_SECRET` length of 32 characters should be enforced
3. Consider removing the endpoint or placing it on a separate internal-only binding

---

### RISK-012: Credential Stuffing / Brute Force on Authentication Endpoints

| Field | Value |
|---|---|
| **Asset** | API keys; admin secret; session integrity |
| **Threat** | Attacker sends high volumes of requests with different `X-API-Key` or `X-Admin-Secret` values to guess valid credentials |
| **Vulnerability** | No rate limiting on authentication header verification; no account lockout |
| **Likelihood** | 3 — Cloudflare Tunnel URL is publicly accessible |
| **Impact** | 4 — successful credential guess grants API access or admin access |
| **Gross Risk Score** | 12 |

**Current controls:**
- API key comparison uses `timingSafeEqual` to prevent timing-based enumeration of valid key prefixes
- Admin secret comparison likewise uses constant-time comparison
- Cloudflare Tunnel provides some DDoS protection at the network layer
- High-entropy API keys (recommended: 32+ random bytes) make brute force computationally infeasible

**Residual risk:** 6 (constant-time comparison and high entropy keys make brute force impractical)

**Treatment decision:** Mitigate
**Treatment actions:**
1. Implement request rate limiting middleware (e.g., 100 requests per minute per IP, 10 failed auth attempts per minute per IP)
2. Log failed authentication attempts for monitoring

---

## 3. Risk Treatment Summary

| Risk ID | Title | Gross Score | Residual Score | Treatment |
|---|---|---|---|---|
| RISK-001 | LinkedIn token theft via .sessions.json | 10 | 8 | Mitigate |
| RISK-002 | LinkedIn client secret exposure | 10 | 6 | Mitigate |
| RISK-003 | SESSION_SECRET compromise | 10 | 6 | Mitigate |
| RISK-004 | Unauthorized API access | 8 | 4 | Mitigate |
| RISK-005 | Shell injection via repoPath | 15 | 6 | Mitigate |
| RISK-006 | CSRF in OAuth flow | 8 | 4 | Accept |
| RISK-007 | Tunnel URL hijacking | 8 | 4 | Mitigate |
| RISK-008 | Session fixation | 8 | 3 | Accept |
| RISK-009 | LinkedIn account suspension | 9 | 6 | Mitigate |
| RISK-010 | RSS feed injection | 3 | 2 | Accept |
| RISK-011 | Admin endpoint exposure | 12 | 8 | Mitigate |
| RISK-012 | Credential stuffing | 12 | 6 | Mitigate |

---

## 4. Review History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-02 | Kim Harjamäki | Initial risk assessment |
