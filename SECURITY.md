# Security Policy

## Reporting a vulnerability

Email **kim.harjamaki@prosimo.fi** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (minimal reproduction case preferred)
- Your suggested fix if you have one

You will receive an acknowledgement within **48 hours** and a resolution timeline within
5 business days. Please do not open a public GitHub issue for security vulnerabilities
until they have been resolved and disclosed responsibly.

---

## Security model overview

OgeonX LinkedIn Autopilot implements a two-legged OAuth architecture:

```
ChatGPT ──(Bearer JWT)──► MCP Server ──(LinkedIn access token)──► LinkedIn API
                               │
                        Session store
                    (server-side only, never sent to ChatGPT)
```

**Leg 1 — Server acts as OAuth Client toward LinkedIn.**
The server holds `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` and performs the
authorization code exchange with LinkedIn on behalf of the user. The resulting LinkedIn
access token is stored in the server-side session store and never leaves the server.

**Leg 2 — Server acts as Authorization Server toward ChatGPT.**
After the user authenticates via LinkedIn, the server issues a short-lived JWT signed
with `SESSION_SECRET`. ChatGPT presents this JWT as a Bearer token on every MCP call.
The JWT carries only a `sessionId` claim — the LinkedIn token itself is never included
in the JWT.

**Token resolution at call time.**
When ChatGPT calls a tool, `requireAuth` middleware verifies the JWT, extracts the
`sessionId`, and looks up the LinkedIn access token in the in-memory session store.
The tool handler receives the token from the session — it is never passed through the
MCP protocol.

---

## What is and is not exposed

| Item | Exposed to ChatGPT? | Exposed in logs? | Notes |
|------|---------------------|------------------|-------|
| `LINKEDIN_CLIENT_SECRET` | Never | Never | `sanitizeErrors` middleware redacts it from all error messages |
| LinkedIn access token | Never | Never | Lives in server-side session store only |
| LinkedIn refresh token | Never | Never | Same as access token |
| `SESSION_SECRET` | Never | Never | Used only for JWT signing/verification |
| JWT (`sessionId` claim) | Yes — Bearer token | No | Short-lived (1h for MCP, 30d for routines) |
| LinkedIn profile (name, email) | Yes — tool response | No | Returned intentionally by `getProfile` tool |

---

## Implemented security controls

### CSRF protection
The `/auth/callback` route validates the OAuth `state` parameter using `crypto.timingSafeEqual`
(Node.js built-in constant-time comparison). This prevents timing side-channels that
could be exploited to bypass the CSRF check in state-guessing attacks.

### HttpOnly cookies
Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. They are
HMAC-signed using `SESSION_SECRET`. The raw `sessionId` is never exposed to JavaScript.

### Origin guard
The `originGuard` middleware (registered before all routes in `src/index.ts`) blocks
requests whose `Origin` header is not in the `ALLOWED_ORIGINS` allowlist. This prevents
cross-origin abuse of the MCP endpoints.

### Error sanitization
The global `sanitizeErrors` error handler (registered last, in `src/index.ts`) scans
every error message for the literal value of `LINKEDIN_CLIENT_SECRET` using a regex
replacement before returning the response. Stack traces are logged server-side only,
never returned to callers.

### Shell injection prevention
`getRecentCommits` uses `spawnSync("git", argsArray)` with `shell: false` (the default).
User-supplied paths are validated with `path.resolve` + `existsSync` before being passed
to git. No string interpolation is used.

### JWT signing
JWTs are signed with HMAC-SHA256 using `SESSION_SECRET` (minimum 32 characters enforced
at startup). The server verifies the signature and expiry on every authenticated request.

---

## If LinkedIn tokens are compromised

If you believe your LinkedIn OAuth tokens have been stolen or leaked:

1. **Revoke the application's access** at
   [linkedin.com/developers](https://www.linkedin.com/developers/apps) → your app →
   OAuth 2.0 settings → Revoke all tokens.
2. **Rotate `SESSION_SECRET`** in your `.env` file and restart the server. This
   invalidates all existing JWTs immediately.
3. **Delete `.sessions.json`** on disk. This clears all persisted LinkedIn access tokens.
   Users will need to re-authenticate.
4. Audit your server logs for unexpected calls to `/routine/*` or `/mcp` endpoints.

---

## Security checklist for self-hosters

Follow these steps before exposing the server to the internet.

- [ ] Use a named Cloudflare tunnel (not `ngrok`) for a stable, TLS-terminated public URL.
      Set `SERVER_URL` to the tunnel URL. This ensures LinkedIn's `redirect_uri` whitelist
      remains valid across tunnel restarts.
- [ ] Set `ADMIN_SECRET` to a random 32-character string. The admin dashboard at `/admin`
      requires this as a Bearer token.
- [ ] Set `SESSION_SECRET` to a random 32+ character string generated with
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- [ ] Rotate `SESSION_SECRET` every 90 days. All active sessions will require
      re-authentication after rotation — schedule this during low-usage periods.
- [ ] Set `ALLOWED_ORIGINS` to your ChatGPT action origin
      (e.g., `https://chatgpt.com,https://chat.openai.com`). An empty value allows all
      origins and is not appropriate for production.
- [ ] Ensure `.env`, `.sessions.json`, and `.users.json` are excluded from version control
      (they are already in `.gitignore`).
- [ ] Review LinkedIn app scopes — the server needs only `openid profile email w_member_social`.
      Do not grant `r_liteprofile`, `r_emailaddress`, or `rw_organization_admin` unless
      you have added explicit handlers for those APIs.
- [ ] Enable LinkedIn app's IP restriction (LinkedIn Developer Portal → Auth tab) if your
      server has a static IP.

---

## Dependency security

Run `npm audit` before each deployment. Dependencies with known high or critical
vulnerabilities must be resolved before the server handles production traffic.

For supply-chain security, the `package-lock.json` is committed. Do not use
`--ignore-scripts` without reviewing the affected packages, as some build steps
(native modules) require scripts to run correctly.
