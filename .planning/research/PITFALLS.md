# Domain Pitfalls: LinkedIn MCP Server

**Domain:** LinkedIn OAuth 2.0/OIDC + MCP 2025-06-18 + ChatGPT integration
**Researched:** 2026-06-30
**Confidence:** HIGH (all claims verified against official LinkedIn docs and MCP spec)

---

## 1. LinkedIn OAuth Gotchas

### PITFALL 1.1: Redirect URI Exact-String Match (CRITICAL)

**What goes wrong:** LinkedIn performs byte-for-byte string comparison on redirect URIs. Any deviation between what is registered in the Developer Portal and what is sent in the authorization request causes an immediate `401 Redirect_uri doesn't match` error. This includes trailing slashes, port numbers, HTTP vs HTTPS, query parameters, and URL-encoded characters.

**Specifics confirmed by official docs:**
- URLs must be absolute (no relative paths like `/callback`)
- Query parameters in registered URIs are stripped and ignored — `https://example.com/callback?id=1` is stored as `https://example.com/callback`
- Fragment identifiers (`#`) are invalid in redirect URIs
- Parameters are NOT forwarded to the redirect — use the `state` parameter to carry application context
- The error from `/oauth/v2/accessToken` for mismatch is `invalid_redirect_uri` with message: `"appid/redirect uri/code verifier does not match authorization code"`

**Warning signs:**
- `401` from `/oauth/v2/authorization`
- `400 invalid_redirect_uri` from `/oauth/v2/accessToken`
- Works locally but fails after deploying (HTTP vs HTTPS)

**Prevention:**
- Register every URI you will ever use up front: `http://localhost:3000/auth/callback` for dev, `https://<ngrok>.ngrok.io/auth/callback` for tunnel, `https://<domain>/auth/callback` for prod
- Keep a single canonical callback path (e.g., `/auth/linkedin/callback`) — do not vary it per environment; vary it via subdomain or port only
- The `redirect_uri` sent in Step 3 (token exchange) must match the one sent in Step 2 (authorization request) exactly, not just what is registered

**Phase:** Phase 1 (OAuth foundation). Register all URIs before writing a single line of auth code.

---

### PITFALL 1.2: PKCE Is NOT Standard on LinkedIn (MEDIUM)

**What goes wrong:** LinkedIn does not enable PKCE by default. To use PKCE, you must contact LinkedIn developer support to have it activated on your specific app, and it uses a different authorization endpoint. The PROJECT.md lists PKCE as a requirement but it will silently not work unless activated.

**Specifics:**
- Standard 3-legged flow: `https://www.linkedin.com/oauth/v2/authorization` — no PKCE
- PKCE flow uses a different endpoint (undocumented in public docs, requires enablement request)
- Sending `code_challenge` and `code_challenge_method` to the standard endpoint results in them being silently ignored, not an error

**Warning signs:**
- No error is returned when you send PKCE parameters to the standard endpoint — they are silently ignored
- The token exchange still works but PKCE was not actually enforced

**Prevention:**
- For this MCP server (server-side Node.js, not a native/SPA client), PKCE is a security best-practice but not strictly required since the client secret is available server-side
- Keep `client_secret` in the token exchange — this is the server-side equivalent of PKCE protection
- Document the decision: using `client_secret` in server-to-server token exchange; PKCE enhancement deferred to if LinkedIn enables it on App ID 260420654

**Phase:** Phase 1 (OAuth). Decide explicitly to use standard flow with `client_secret` and document it.

---

### PITFALL 1.3: Authorization Code Expires in 30 Minutes (MEDIUM)

**What goes wrong:** The authorization code LinkedIn returns is valid for only 30 minutes. In a typical flow this is irrelevant, but if there is any async processing, queuing, or debug breakpoints between receiving the code and exchanging it, it expires and the entire OAuth dance must restart.

**Specifics:**
- Authorization code: 30-minute TTL (confirmed in official docs)
- Access token: 60-day TTL (`expires_in` returns `5184000` seconds = 60 days)
- Refresh token: 365-day TTL
- Programmatic refresh tokens are a limited partner feature — standard apps must redirect users back through the consent screen when the access token expires (unless approved for refresh tokens)
- If scopes change in the app configuration, all existing tokens are immediately invalidated regardless of TTL

**Warning signs:**
- `401 invalid_request "authorization code not found"` during token exchange
- Users getting re-prompted for auth unexpectedly after 60 days

**Prevention:**
- Exchange the authorization code immediately and synchronously in the callback handler
- Store `expires_in` alongside the token and implement proactive refresh (refresh when less than 7 days remaining)
- Check whether App ID 260420654 has programmatic refresh tokens enabled; if not, implement graceful re-auth UX
- Never change scope definitions on the live app without planning for token invalidation

**Phase:** Phase 1 (OAuth). Phase 3 (token refresh/expiry handling).

---

### PITFALL 1.4: Scope Names Changed — Old Scopes Break New Apps (CRITICAL)

**What goes wrong:** LinkedIn deprecated `r_liteprofile` and `r_emailaddress` for all apps created after August 1, 2023. New apps (including App ID 260420654) must use OIDC scopes. Sending the old scope names returns `401 Invalid scope`.

**Confirmed scope mapping:**

| Old scope (do not use) | New scope | Requires Product |
|---|---|---|
| `r_liteprofile` | `profile` | Sign In with LinkedIn using OpenID Connect |
| `r_emailaddress` | `email` | Sign In with LinkedIn using OpenID Connect |
| (new) | `openid` | Sign In with LinkedIn using OpenID Connect |
| `w_member_social` | `w_member_social` | Share on LinkedIn (unchanged) |

**Warning signs:**
- `401 Invalid scope` on any authorization request
- Tutorials and Stack Overflow answers pre-2023 will show the old scope names — do not follow them

**Prevention:**
- Use `openid profile email w_member_social` as the scope string
- Confirm in the LinkedIn Developer Portal under Auth tab which scopes are provisioned for App 260420654
- The app must have "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" products approved

**Phase:** Phase 1 (OAuth). Verify scopes in Developer Portal before coding.

---

### PITFALL 1.5: Token Endpoint Requires `Content-Type: application/x-www-form-urlencoded` (LOW)

**What goes wrong:** The `/oauth/v2/accessToken` POST endpoint requires `application/x-www-form-urlencoded` body encoding, not JSON. Sending a JSON body returns a cryptic 400 error.

**Warning signs:**
- `400 Bad Request` on token exchange despite correct parameters

**Prevention:**
- Use a URL-encoded form body for all OAuth token endpoint calls
- Never send JSON to OAuth token endpoints

**Phase:** Phase 1 (OAuth). Single line in implementation.

---

## 2. LinkedIn API v2 Gotchas

### PITFALL 2.1: ugcPosts Requires `X-Restli-Protocol-Version: 2.0.0` Header (CRITICAL)

**What goes wrong:** All `/v2/ugcPosts` requests require the header `X-Restli-Protocol-Version: 2.0.0`. Without it, requests may succeed but return responses in Restli 1.0 format, or return 400 errors with confusing messages like `"Invalid query parameters passed to request"` that mask the real issue.

**Warning signs:**
- `400 Invalid query parameters passed to request`
- Unexpected response format on GET requests
- Postman-based tests fail but curl-based tests work (Postman clients often trigger this)

**Prevention:**
- Set `X-Restli-Protocol-Version: 2.0.0` on every request to `/v2/ugcPosts`
- Add this as a default header in your HTTP client/axios instance for all LinkedIn API calls
- URNs in URL parameters must be URL-encoded when using Restli 2.0

**Phase:** Phase 2 (API integration). Add to a shared LinkedIn API client module.

---

### PITFALL 2.2: ugcPosts Body Has a Complex Namespaced Structure (CRITICAL)

**What goes wrong:** The `specificContent` field uses a namespaced union type key `"com.linkedin.ugc.ShareContent"`. The `visibility` field uses `"com.linkedin.ugc.MemberNetworkVisibility"`. These look unusual and are easy to typo. The API returns `422 Error validating the post` with minimal context.

**Correct minimal body for a text post:**
```json
{
  "author": "urn:li:person:{personId}",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": {
        "attributes": [],
        "text": "Your post text here"
      },
      "shareMediaCategory": "NONE",
      "media": []
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

**Critical details:**
- `lifecycleState` must be `"PUBLISHED"` (exact string, uppercase)
- `shareMediaCategory` must be `"NONE"` for text-only posts
- `media` array must be present (even if empty) — omitting it causes 422
- `attributes` array in `shareCommentary` must be present (even if empty)
- The response is `201 Created`, not `200 OK` — the created post URN is in the `x-restli-id` response header, not the body
- Text limit is 3000 characters
- Duplicate posts within 10 minutes return `422 Content is a duplicate` — affects testing

**Warning signs:**
- `422 Error validating the post`
- `422 Content is a duplicate` during rapid iteration testing
- `400 Error parsing request body` — usually an escaped character issue

**Prevention:**
- Build and unit-test the request body construction independently before wiring to the API
- Read the `x-restli-id` response header to get the post ID after creation
- Wait 10+ minutes between identical test posts, or vary the text

**Phase:** Phase 2 (API integration). The `postUpdate` tool implementation.

---

### PITFALL 2.3: Author URN Must Come from /v2/userinfo, Not Be Constructed Manually (CRITICAL)

**What goes wrong:** The `author` field in ugcPosts requires `urn:li:person:{sub}` where `{sub}` is the OIDC subject identifier returned by `/v2/userinfo`. You cannot construct this from other LinkedIn profile data. The old `/v2/me` endpoint returned a numeric `id`; the new OIDC `sub` is an alphanumeric string like `"782bbtaQ"`.

**Confirmed by official docs:**
- `/v2/userinfo` `sub` field: opaque text identifier (not numeric)
- `urn:li:member:{id}` is a deprecated URN format — use `urn:li:person:{sub}`
- Using `urn:li:member:` prefix instead of `urn:li:person:` returns `401 Member is unauthorized to create UserGeneratedContent`

**Warning signs:**
- `401 Member is unauthorized to create UserGeneratedContent`
- `400` or `422` on post creation despite valid auth token
- Old tutorials using `/v2/me` and `urn:li:member:` format — these are wrong for new apps

**Prevention:**
- Always call `/v2/userinfo` immediately after OAuth to get the `sub` claim
- Store the `sub` value in your token store alongside access token
- Build author URN as `urn:li:person:${sub}` — always, no exceptions

**Phase:** Phase 1 (OAuth) + Phase 2 (API). Capture `sub` from `/v2/userinfo` during the OAuth callback, not lazily at post time.

---

### PITFALL 2.4: Rate Limits Are Not Publicly Published and Are Both App-Level and Member-Level (MEDIUM)

**What goes wrong:** LinkedIn does not publish specific rate limit numbers in documentation. There are two independent rate limit buckets: application-level (total calls your app can make per day) and member-level (calls per user per day). Both return 429 when exceeded. The `429 UGC action was blocked because a share limit has been reached` indicates the member hit a daily post limit.

**Specifics:**
- Rate limits reset daily at midnight UTC
- 75% threshold triggers an email alert to developer admins — but only for app-level breaches, not member-level
- Alert delivery has 1-2 hour lag — not real-time
- To discover your rate limits: make at least 1 call to an endpoint, then check the Developer Portal Analytics tab

**Warning signs:**
- `429 Too Many Requests`
- `429 UGC action was blocked because a share limit has been reached`
- `429 Resource level throttle {period} limit for calls to this resource is reached`

**Prevention:**
- Implement exponential backoff with jitter on all 429 responses
- Distinguish member-level 429 (`share limit`) from app-level 429 (`resource throttle`) in error messages shown to ChatGPT
- Check Developer Portal Analytics tab after first deployment to discover actual quotas
- Never retry immediately on 429 — LinkedIn infrastructure protection also returns 429 even when under quota

**Phase:** Phase 2 (API). Phase 4 (error handling).

---

### PITFALL 2.5: The Marketing APIs Use a Different Versioning System (LinkedIn-Version Header) (MEDIUM)

**What goes wrong:** LinkedIn's Marketing Solution APIs (LMS) use a `LinkedIn-Version: YYYYMM` header. The core v2 APIs (`/v2/ugcPosts`, `/v2/userinfo`) do not use this header. Applying the LMS versioning header to core v2 endpoints may cause unexpected behavior. Applying it to the wrong API produces `400 Nonexistent_Version` errors.

**Confirmed by official docs:**
- `/v2/userinfo` — no `LinkedIn-Version` header needed
- `/v2/ugcPosts` (compliance/ugcPosts API) — no `LinkedIn-Version` header needed
- If you ever use Posts API (`/rest/posts`) under LMS, then `LinkedIn-Version: YYYYMM` is required

**Warning signs:**
- `400 Nonexistent_Version` on any API call
- Tutorials mixing LMS Marketing API docs with core v2 docs

**Prevention:**
- This project uses `openid`, `profile`, `email`, `w_member_social` scopes and core v2 endpoints only
- Do not add `LinkedIn-Version` header to `/v2/ugcPosts` or `/v2/userinfo` calls
- If future phases add LMS Marketing APIs, add the header only for those requests

**Phase:** Phase 2 (API). Awareness-level — do not add this header unless explicitly using LMS APIs.

---

## 3. MCP Protocol Gotchas

### PITFALL 3.1: ChatGPT Creates a Fresh Session Per Tool Call — Do Not Rely on Session State (CRITICAL)

**What goes wrong:** ChatGPT's MCP connector violates the MCP spec by creating a new session for every tool call instead of reusing `Mcp-Session-Id`. Each call triggers: OAuth token check, MCP `InitializeRequest`, tool discovery, then the actual tool call. Any server-side state keyed to `sessionId` (cached profile, OAuth context, tool state) is lost between tool calls.

**Confirmed behavior:**
- New `Mcp-Session-Id` on every tool invocation
- Full `initialize` + `tools/list` handshake on every call (roughly +1 second overhead per call)
- Sequential only — ChatGPT cannot execute parallel tool calls (unlike Claude Desktop)
- Context stored in session is silently lost

**Warning signs:**
- User selects context in one tool call; next tool call has lost it
- Server-side session cache appears to work but data never persists across user interactions
- Unexpectedly high initialization overhead in server logs

**Prevention:**
- Key all persistent state to `userId` (derived from LinkedIn `sub`), not `sessionId`
- Do not use `Mcp-Session-Id` as a cache key for anything that needs to survive between tool calls
- If session-key storage is used for performance, also write to a user-key fallback
- Design tools to be stateless — each tool call should fully resolve its needed context from persistent storage

**Phase:** Phase 1 (MCP server bootstrap). This affects the fundamental state management design.

---

### PITFALL 3.2: Origin Header Validation Is a Security Requirement, Not Optional (CRITICAL)

**What goes wrong:** The MCP 2025-06-18 spec mandates servers MUST respond with `403 Forbidden` if the `Origin` header is present and invalid. This is not optional — it is the primary defense against DNS rebinding attacks. Both the TypeScript MCP SDK (fixed in 1.24.0) and Python SDK had this vulnerability. Using an older SDK version means the check is absent even if you think it's there.

**Confirmed by official spec (section on Streamable HTTP security):**
- `Origin` header must be validated on ALL incoming connections
- Invalid/missing `Origin` (when expected) → `403`
- Bind to `127.0.0.1` not `0.0.0.0` when running locally

**Warning signs:**
- Using `@modelcontextprotocol/sdk` below version 1.24.0 — vulnerability present, no error thrown
- Server deployed without origin allowlist configured
- `origin` validation code path never tested (no test that sends a bad Origin)

**Prevention:**
- Use `@modelcontextprotocol/sdk` >= 1.24.0
- Configure explicit `allowedOrigins` or equivalent in the SDK's HTTP server options
- For production (Azure Container Apps), the valid Origin is the ChatGPT domain
- For local dev (ngrok), the valid Origin is `https://<subdomain>.ngrok.io`
- Add an integration test that sends `Origin: https://evil.com` and expects `403`

**Phase:** Phase 1 (MCP server bootstrap). Do not skip this during initial setup.

---

### PITFALL 3.3: SSE Disconnect Does Not Mean Request Cancelled (MEDIUM)

**What goes wrong:** Network disconnection during an SSE stream is not a client cancel signal per MCP spec. The server must not abort the in-flight operation on disconnect. Only an explicit `CancelledNotification` means cancel. If the server aborts LinkedIn API calls on SSE disconnect, posts may be half-submitted or the user will re-trigger the operation.

**Confirmed by official spec:**
- "Disconnection SHOULD NOT be interpreted as the client cancelling its request"
- "To cancel, the client SHOULD explicitly send an MCP CancelledNotification"
- After the JSON-RPC response is sent, the server SHOULD close the SSE stream

**Warning signs:**
- Post appears on LinkedIn but ChatGPT shows an error (disconnect before response delivery)
- Duplicate posts (user retries because they didn't see confirmation)

**Prevention:**
- Make all LinkedIn API calls before writing to the SSE stream
- Use the `Last-Event-ID` and resumability mechanism for long-running operations
- Return operation status in the JSON-RPC response, not just in SSE events

**Phase:** Phase 2 (tool implementation). Handle this in `postUpdate` particularly.

---

### PITFALL 3.4: Session ID Must Be Included on All Subsequent Requests (MEDIUM)

**What goes wrong:** Per MCP spec, if the server issues an `Mcp-Session-Id` in the `InitializeResult` response, ALL subsequent client requests must include it. A server that requires a session ID must return `400 Bad Request` for any request missing it (except `initialize`). Getting this flow wrong means either ChatGPT drops the session ID (known behavior — see Pitfall 3.1) or the server incorrectly rejects valid requests.

**Per spec:**
- Session ID must be cryptographically secure (UUID, JWT, or hash)
- Session ID must contain only visible ASCII characters (0x21–0x7E)
- Server must return `404 Not Found` when receiving an expired/unknown session ID
- Client receiving `404` for a session must re-initialize

**Prevention:**
- Given ChatGPT's known behavior of not reusing session IDs (Pitfall 3.1), consider making session IDs optional on the server — accept requests with or without a session ID
- If sessions are used, implement session cleanup/TTL (don't accumulate dead sessions in memory)
- Return `404` not `400` for expired sessions — this signals to compliant clients to re-initialize

**Phase:** Phase 1 (MCP bootstrap). Session management design choice.

---

### PITFALL 3.5: MCP-Protocol-Version Header Required on Subsequent Requests (LOW)

**What goes wrong:** After initialization, the MCP 2025-06-18 spec requires clients to send `MCP-Protocol-Version: 2025-06-18` on all subsequent HTTP requests. If this header is absent, the server should assume `2025-03-26`. If the header has an invalid value, the server MUST return `400 Bad Request`. Building the server to be strict about this can break ChatGPT if it does not send the header correctly.

**Prevention:**
- Be lenient — accept missing `MCP-Protocol-Version` and default to `2025-03-26` behavior
- Log the received version for debugging but do not reject requests missing the header
- Only return `400` for genuinely unsupported version values

**Phase:** Phase 1. Awareness-level.

---

## 4. Local Development Gotchas

### PITFALL 4.1: ngrok URL Changes on Restart and LinkedIn Has No Wildcard URI Support (CRITICAL)

**What goes wrong:** The free ngrok tier assigns a random subdomain on every restart (e.g., `https://a3b2.ngrok.io` → `https://7f9c.ngrok.io`). LinkedIn requires the exact redirect URI to be registered in the Developer Portal before use. A new ngrok URL = broken OAuth until you update the Developer Portal, which can take a minute to propagate.

**Warning signs:**
- `401 Redirect_uri doesn't match` immediately after restarting ngrok
- Developer productivity killed by constant Portal updates

**Prevention (in priority order):**
1. Use `ngrok config add-authtoken <token>` and configure a static domain in `ngrok.yml` — paid ngrok plans offer a reserved subdomain that persists across restarts
2. Alternative: use `cloudflared tunnel` (Cloudflare Tunnel) which offers free permanent subdomains
3. Alternative: use `localhost.run` with SSH tunneling which also offers persistent URLs
4. Register multiple candidate ngrok URLs in the Developer Portal during development
5. Keep a `Makefile` or script that opens the Portal settings page to speed up the update loop

**Phase:** Phase 0 (dev environment setup). Solve this before starting OAuth development.

---

### PITFALL 4.2: LinkedIn Requires HTTPS for Redirect URIs (Not Just for Production) (MEDIUM)

**What goes wrong:** LinkedIn's Developer Portal requires all redirect URIs to use HTTPS. You cannot register `http://localhost:3000/callback` for testing. This forces the use of a tunnel (ngrok, cloudflared) even for pure local development, adding complexity.

**Exception:** LinkedIn does allow `http://localhost` as a special case for native app flows, but this project is a server-side MCP server, not a native client — the standard 3-legged flow applies.

**Warning signs:**
- Developer Portal rejects `http://` redirect URI registration
- "Server must only communicate with trusted URLs" error

**Prevention:**
- Use ngrok or cloudflared from day one for local dev — do not attempt to work around the HTTPS requirement
- For automated integration tests, use a self-signed TLS certificate with a local reverse proxy (caddy, mkcert) as an alternative to ngrok

**Phase:** Phase 0 (dev environment). Built into the dev setup guide.

---

## 5. Security Pitfalls

### PITFALL 5.1: Access Tokens Must Never Appear in Logs (CRITICAL)

**What goes wrong:** Access tokens are ~500 characters long. If your HTTP client logs request/response headers or bodies, tokens will appear in logs, CI output, monitoring dashboards, and anywhere logs are shipped. LinkedIn access tokens grant full API access for 60 days.

**Warning signs:**
- `Authorization: Bearer AQUvlL_DYEzvT2wz...` in server logs, console output, or error traces
- Error logging middleware that logs the full request object (which includes Authorization header)

**Prevention:**
- Configure your HTTP client (axios interceptor, fetch wrapper) to redact `Authorization` headers before logging
- Implement a `sanitizeForLog(obj)` utility that replaces token values with `[REDACTED]`
- In error handling: `error.config.headers.Authorization` must be redacted before logging
- Do not log LinkedIn API request/response bodies in production — they may contain PII

**Phase:** Phase 1 (infrastructure). Built into the logging setup.

---

### PITFALL 5.2: State Parameter Is Required for CSRF Protection and Must Be Validated Exactly Once (CRITICAL)

**What goes wrong:** The `state` parameter in OAuth is the only defense against CSRF attacks during the OAuth callback. Three failure modes: (1) not generating `state`, (2) generating it but not validating it on callback, (3) using a predictable value (like a user ID or timestamp). The spec explicitly warns: "If the state values do not match, you are likely the victim of a CSRF attack."

**Confirmed by official LinkedIn docs:**
- State validation is explicitly called out in the OAuth flow documentation
- Authorization code has a 30-minute window — an active attacker can use this window

**Prevention:**
- Generate state with `crypto.randomBytes(32).toString('hex')` — never use sequential or user-derived values
- Store state server-side (Redis, in-memory Map with TTL) keyed to the session/request
- Validate state on callback before doing anything with the code — use timing-safe comparison (`crypto.timingSafeEqual`)
- Delete state from storage immediately after validation (single-use)
- Set TTL on stored state (30 minutes max, matching code TTL)

**Phase:** Phase 1 (OAuth). Non-negotiable security requirement.

---

### PITFALL 5.3: Client Secret in Environment Variables Must Not Be Committed (CRITICAL)

**What goes wrong:** `LINKEDIN_CLIENT_SECRET` committed to Git, even once, is permanently in history (including after deletion from HEAD). LinkedIn secrets grant the ability to exchange authorization codes for tokens for any user who authorizes the app.

**Warning signs:**
- `.env` file not in `.gitignore` before first commit
- Secrets hardcoded in config files or tests
- CI/CD logs echoing environment variables

**Prevention:**
- `.gitignore` must include `.env`, `.env.local`, `.env.*.local` before the first `git init` / `git add`
- Use `.env.example` with placeholder values committed; actual `.env` never committed
- Rotate the client secret in the LinkedIn Developer Portal if any exposure is suspected
- Use Azure Key Vault / environment variable injection in Azure Container Apps — never bake secrets into container images

**Phase:** Phase 0 (project setup). Pre-commit hook to block secret patterns.

---

### PITFALL 5.4: Refresh Token Storage Must Be Encrypted at Rest (MEDIUM)

**What goes wrong:** Refresh tokens are valid for 365 days and can silently generate new access tokens. Storing them in plaintext (file, SQLite without encryption, Redis without auth) creates a persistent, long-lived credential exposure risk.

**Prevention:**
- For MVP (single-user): encrypt refresh token using `AES-256-GCM` with a key derived from `ENCRYPTION_KEY` env var before writing to any storage
- For production: Azure Container Apps + Azure Key Vault for key management; use managed identity
- Never store tokens in cookies without `HttpOnly`, `Secure`, and `SameSite=Strict`
- Never store tokens in `localStorage` (accessible to JavaScript — XSS vulnerability)

**Phase:** Phase 1 (token storage). Design the token store with encryption from the start.

---

## Phase-Specific Warning Summary

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Project setup / first commit | Client secret committed to Git (5.3) | `.gitignore` + pre-commit hook before `git init` |
| Dev environment | ngrok URL rotation breaking OAuth (4.1) | Static ngrok domain or cloudflared before starting OAuth |
| OAuth flow implementation | Wrong scope names (`r_liteprofile`) (1.4) | Verify scopes in Developer Portal first |
| OAuth flow implementation | State CSRF validation missing (5.2) | Implement and test before any other OAuth code |
| Token exchange | Wrong Content-Type for token endpoint (1.5) | `application/x-www-form-urlencoded` always |
| MCP server bootstrap | Origin validation absent (3.2) | SDK >= 1.24.0, configure allowedOrigins |
| MCP server bootstrap | Session state lost per-call by ChatGPT (3.1) | Key state to userId, not sessionId |
| getProfile tool | Using /v2/me instead of /v2/userinfo (2.3) | Always use `/v2/userinfo` for OIDC apps |
| postUpdate tool | Missing X-Restli-Protocol-Version (2.1) | Add as default header in LinkedIn client |
| postUpdate tool | Wrong ugcPosts body structure (2.2) | Test body construction in isolation first |
| postUpdate tool | SSE disconnect misread as cancel (3.3) | Run LinkedIn API call before opening SSE |
| Error handling | Token in logs (5.1) | Redact Authorization header in all log paths |
| Production deployment | Redirect URI not registered for prod domain (1.1) | Register prod URI before deploying |

---

## Sources

- LinkedIn 3-Legged OAuth Flow (official, updated 2026-05-15): https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- LinkedIn OIDC / Sign In v2 (official): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- LinkedIn UGC Post API (compliance, official): https://learn.microsoft.com/en-us/linkedin/compliance/integrations/shares/ugc-post-api
- LinkedIn Rate Limiting (official, updated 2025-08-20): https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits
- LinkedIn Programmatic Refresh Tokens: https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
- MCP 2025-06-18 Transports Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP DNS Rebinding CVE (TypeScript SDK fix in 1.24.0): https://vulnerablemcp.info/vuln/cve-2025-66414-66416-dns-rebinding-mcp-sdks.html
- ChatGPT MCP Session Problem analysis: https://medium.com/@ylenius/openais-mcp-session-problem-and-how-we-worked-around-it-7b40d1b19710
- LinkedIn scope deprecation (strapi/strapi issue): https://github.com/strapi/strapi/issues/19641
- LinkedIn OAuth2 setup notes 2025: https://medium.com/@ed.sav/setting-up-linkedin-oauth-few-notes-2025-0097ac858157
