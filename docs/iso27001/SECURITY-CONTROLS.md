# Security Controls Implementation (ISO 27002:2022 Annex A)

**Document ID:** ISMS-CTL-001
**Version:** 1.0
**Date:** 2026-07-02
**Owner:** Kim Harjamäki (kim.harjamaki@prosimo.fi)
**Classification:** Internal
**Standard:** ISO/IEC 27002:2022

---

## Overview

This document maps the security controls implemented in OgeonX LinkedIn Autopilot to their corresponding ISO/IEC 27002:2022 Annex A control numbers. Each control entry identifies the source file or mechanism that implements the control, the current implementation status, and any gaps or planned enhancements.

**Status key:**
- **Implemented** — Control is in place and verified in code
- **Partial** — Control is partially implemented; gaps documented
- **Planned** — Control is identified and scheduled for implementation
- **Not applicable** — Control does not apply to this system

---

## A.5 Organizational Controls

### A.5.1 — Policies for information security

**Status:** Implemented

**Implementation:**
- Top-level security policy is documented in `SECURITY.md` and `docs/iso27001/ISMS-OVERVIEW.md`
- `.env` file is excluded from version control by documented policy
- `.gitignore` must include `.env`, `.sessions.json`, `.users.json`, and `dist/`
- `CONTRIBUTING.md` documents secure development practices including prohibition on committing secrets

**Verification:** `git ls-files .env` should return empty; `.env` must not appear in any commit.

---

### A.5.2 — Information security roles and responsibilities

**Status:** Implemented

**Implementation:**
- Roles defined in `docs/iso27001/ISMS-OVERVIEW.md` Section 4
- Single owner (Kim Harjamäki) holds all operational responsibilities for this single-operator deployment
- Responsibility boundary with LinkedIn (external API, their own security controls) is documented in scope

---

### A.5.10 — Acceptable use of information and other associated assets

**Status:** Implemented

**Implementation:**
- Application operates exclusively within LinkedIn's permitted API use cases
- No scraping of LinkedIn pages; all data obtained via documented LinkedIn API v2 endpoints (`/v2/userinfo`, `/v2/ugcPosts`, `/v2/organizations`)
- Scope limited to `w_member_social`, `w_organization_social`, `r_organization_social`, `rw_organization_admin`, `openid`, `profile`, `email` — only scopes required for declared functionality
- `r_member_social` (read member posts) is explicitly not requested, adhering to least-privilege
- API Terms of Service compliance reviewed annually

---

### A.5.12 — Classification of information

**Status:** Implemented

**Implementation:**
- Data classification scheme defined in `docs/iso27001/DATA-CLASSIFICATION.md`
- Four tiers: Public, Internal, Confidential, Restricted
- All credentials classified as Restricted; user PII classified as Internal

---

### A.5.23 — Information security for use of cloud services

**Status:** Implemented

**Implementation:**
- Cloudflare Tunnel used as HTTPS ingress; no inbound ports required on host
- Cloudflare processes only TLS-encrypted traffic headers; plaintext data is not accessible to Cloudflare beyond TLS termination
- LinkedIn API is the primary cloud service; no user data stored at LinkedIn beyond what LinkedIn itself holds as the OAuth provider

---

### A.5.33 — Protection of records

**Status:** Partial

**Implementation:**
- Session data persisted in `.sessions.json`; user registry persisted in `.users.json`
- Both files written atomically via `writeFileSync`

**Gap:** No formal backup procedure for `.sessions.json` or `.users.json`. Recovery from loss requires users to re-authenticate. Planned: document recovery procedure.

---

## A.6 People Controls

### A.6.3 — Information security awareness, education and training

**Status:** Implemented

**Implementation:**
- `SECURITY.md` in repository root provides vulnerability disclosure procedure and security guidance for contributors
- `CONTRIBUTING.md` documents secure development practices: no committing of secrets, use of environment variables, dependency update procedures
- Code comments in security-critical modules (`src/auth/jwt.ts`, `src/auth/cookie.ts`, `src/auth/linkedin.ts`) explain security rationale inline:
  - JWT: explains why `timingSafeEqual` is used
  - Cookie: explains HMAC signing and HttpOnly rationale
  - LinkedIn OAuth: explains why PKCE is not currently enabled

---

### A.6.8 — Reporting of information security events

**Status:** Implemented

**Implementation:**
- Security vulnerability disclosure contact: `kim.harjamaki@prosimo.fi` (documented in `SECURITY.md`)
- Incident response procedure in `docs/iso27001/INCIDENT-RESPONSE.md`
- Server errors logged to stderr without embedding secrets

---

## A.7 Physical and Environmental Controls

### A.7.1 — Physical security perimeters

**Status:** Implemented

**Implementation:**
- Cloudflare Tunnel eliminates the need for any inbound firewall rule on the host machine; the host does not listen on any publicly routable port
- All inbound traffic arrives encrypted via Cloudflare's TLS termination before being forwarded to `localhost:3000`
- Physical access to the host machine is governed by the operating system access controls of the deployment environment

---

### A.7.8 — Equipment siting and protection

**Status:** Implemented (by design)

**Implementation:**
- Single-node deployment; no specialized hardware beyond a standard server or developer workstation
- `.env` file containing secrets must reside only on the host; cloud backup of the host must exclude `.env` or use encrypted backup

---

## A.8 Technological Controls

### A.8.2 — Privileged access rights

**Status:** Implemented

**Implementation:**
- Admin endpoint `GET /admin/users` requires `X-Admin-Secret` header matching the `ADMIN_SECRET` environment variable
- `ADMIN_SECRET` is distinct from all other secrets; its exposure grants only user enumeration, not LinkedIn posting access
- Admin secret comparison uses `crypto.timingSafeEqual` via the same constant-time pattern as other secret comparisons
- The MCP server process itself runs without elevated OS privileges

**Gap:** `ADMIN_SECRET` defaults to empty string if not configured in `.env`, which disables authentication on the admin endpoint. Startup validation should enforce a non-empty `ADMIN_SECRET`. See RISK-011.

---

### A.8.3 — Information access restriction

**Status:** Implemented

**Implementation:**
- `requireAuth` middleware (`src/middleware/requireAuth.ts`) is applied to all MCP tools and routine token endpoints
- Authentication resolution order:
  1. `Authorization: Bearer <JWT>` — verified by `verifyJwt()` using HMAC-SHA256 and `timingSafeEqual`
  2. `X-API-Key` — verified against `config.apiKeys` array using `timingSafeEqual` per key
  3. `sid` cookie — verified by `verifySessionId()` using HMAC-SHA256 and `timingSafeEqual`
- Unauthenticated requests receive HTTP 401 with a generic error message (no implementation details disclosed)
- LinkedIn `sub` (user identifier) is always read from the server-side session store, never from client-supplied arguments, preventing impersonation

---

### A.8.5 — Secure authentication

**Status:** Implemented

**Implementation:**

**OAuth 2.0 (primary authentication):**
- Standard authorization code flow against LinkedIn OAuth 2.0 (`https://www.linkedin.com/oauth/v2/authorization`)
- CSRF protection via cryptographically random state parameter (32 hex characters = 16 bytes from `crypto.randomBytes`)
- Authorization code exchanged server-to-server (client secret never sent to browser)
- Note: PKCE is not currently enabled; LinkedIn does not enable PKCE by default for this application tier. This is a known limitation documented in `src/auth/linkedin.ts`.

**JWT (for ChatGPT/Google Agentspace):**
- HS256 JWT signed with `SESSION_SECRET` using Node.js built-in `crypto.createHmac`
- Implementation in `src/auth/jwt.ts`
- Tokens contain: `sub` (sessionId), `iat`, `exp`
- Signature verified with `crypto.timingSafeEqual` to prevent timing attacks
- JWTs issued by `/oauth/token` endpoint expire in 3600 seconds (1 hour)
- JWTs issued by `/routine/token` expire in 30 days (for long-running agent configurations)

**Session cookies (for browser flow):**
- Session ID generated via `crypto.randomUUID()` — 128 bits of entropy
- Cookie value format: `${sessionId}.${HMAC-SHA256(sessionId, SESSION_SECRET)}`
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` (in production), `Max-Age=604800` (7 days)
- Verification uses `timingSafeEqual` to prevent timing-based forgery

---

### A.8.7 — Protection against malware

**Status:** Implemented

**Implementation:**
- No `exec()`, `eval()`, or shell string interpolation in any hot code path
- `getRecentCommits` tool uses `spawnSync` with `shell: false` and an explicit argument array, preventing shell injection
- `repoPath` parameter is validated to be an absolute path before being passed to git
- Dependencies managed via `npm` with `package-lock.json` for reproducible installs
- `npm audit` should be run quarterly (see review schedule in ISMS-OVERVIEW.md)

---

### A.8.9 — Configuration management

**Status:** Implemented

**Implementation:**
- `src/config.ts` validates all required environment variables at startup using explicit presence checks and minimum-length enforcement
- Missing or undersized `SESSION_SECRET` causes immediate process exit with a clear error message
- Missing `LINKEDIN_CLIENT_SECRET` or `LINKEDIN_CLIENT_ID` likewise cause startup failure
- Configuration is type-safe via the `Config` interface with camelCase properties and backward-compatible uppercase aliases
- All config values sourced from `process.env`; no default values for security-sensitive fields
- `validateConfig()` is exported and independently tested

---

### A.8.11 — Data masking

**Status:** Implemented

**Implementation:**
- Error sanitization middleware redacts `LINKEDIN_CLIENT_SECRET` from all error response bodies
- `exchangeCode()` and `refreshAccessToken()` functions include explicit comments documenting that raw response bodies and client secrets are never passed to any logger
- LinkedIn API error responses containing token data are not forwarded to callers; only a generic `OAuthError` with a code is propagated
- Log statements in `config.ts` confirm environment variable presence but never log their values

---

### A.8.12 — Data leakage prevention

**Status:** Implemented

**Implementation:**
- LinkedIn access tokens are stored exclusively in server-side `sessionStore` (in-memory `Map`) and `.sessions.json`; they are never included in MCP tool responses, HTTP response bodies, or log output
- Tool handlers receive `accessToken` as a function parameter from the session store, not from MCP client arguments
- `SessionData` interface documents: "Tokens are NEVER sent to the MCP client — they live here only"
- LinkedIn API responses are not forwarded verbatim; only structured, sanitized data (post ID, profile name, etc.) is returned to callers

---

### A.8.20 — Networks security

**Status:** Implemented

**Implementation:**

**Origin guard (CORS):**
- Hono CORS middleware configured with `ALLOWED_ORIGINS` from environment variable
- `allowedOrigins` defaults to empty; must be explicitly configured for browser-based clients
- Origins not on the allowlist receive a CORS rejection

**Cloudflare Tunnel TLS:**
- All traffic from external clients arrives over TLS 1.2+ via Cloudflare
- Server binds only to `localhost:3000`; no direct external exposure
- Cloudflare handles certificate management and renewal

**SameSite cookie protection:**
- Session cookie set with `SameSite=Lax` to prevent cross-site request submission while allowing top-level navigations

---

### A.8.24 — Use of cryptography

**Status:** Implemented

**Implementation:**
- All cryptographic operations use Node.js built-in `node:crypto` module (no third-party crypto libraries)
- JWT signature: HMAC-SHA256 (`crypto.createHmac("sha256", SESSION_SECRET)`)
- Session cookie signature: HMAC-SHA256 (`crypto.createHmac("sha256", SESSION_SECRET)`)
- OAuth state token: `crypto.randomBytes(16).toString("hex")` — 128 bits of entropy
- Session IDs: `crypto.randomUUID()` — 128 bits of entropy (UUID v4)
- Auth codes in `/oauth/token` flow: `crypto.randomBytes(32).toString("hex")` — 256 bits
- All signature comparisons: `crypto.timingSafeEqual` to prevent timing-based attacks
- `SESSION_SECRET` minimum length enforced at 32 characters (256 bits if alphanumeric ASCII)

**Algorithm choices:**
- HS256 (HMAC-SHA256) selected over RS256 for simplicity appropriate to single-node deployment; avoids key pair management
- No deprecated algorithms (MD5, SHA-1, DES) are used anywhere in the codebase

---

### A.8.28 — Secure coding

**Status:** Implemented

**Implementation:**

**Input validation:**
- All MCP tool inputs validated with `zod` schemas before processing
- `postUpdate` text: validated as string, 1–3000 characters
- `getRecentCommits` count: validated as integer, 1–20
- `repoPath`: validated as absolute path string

**Injection prevention:**
- No SQL database; SQL injection surface does not exist
- Shell injection mitigated by `spawnSync` with `shell: false` and validated path argument
- No template engines with unsafe interpolation; HTML in landing page uses `escapeHtml()` helper to prevent XSS

**Path traversal:**
- `repoPath` validation rejects traversal sequences

**TypeScript type safety:**
- Strict TypeScript compilation catches type errors at build time
- API responses from LinkedIn typed as interfaces (`RawTokenResponse`, `UserInfoResponse`) with explicit casting

**Dependency management:**
- `package-lock.json` committed to ensure reproducible installs
- Quarterly `npm audit` review for known vulnerabilities (see ISMS-OVERVIEW.md review schedule)

---

## A.9 (Legacy) — Note on ISO 27002:2013 vs 2022

This document uses the ISO/IEC 27002:2022 control numbering (A.5–A.8 structure). The 2022 edition reorganized controls from the 2013 edition's A.5–A.18 structure. Organizations comparing this document to ISO 27001:2022 Annex A should use the 2022 mapping table.

---

## Control Implementation Summary

| ISO 27002:2022 Control | Status |
|---|---|
| A.5.1 Policies for information security | Implemented |
| A.5.2 Information security roles and responsibilities | Implemented |
| A.5.10 Acceptable use | Implemented |
| A.5.12 Classification of information | Implemented |
| A.5.23 Cloud services | Implemented |
| A.5.33 Protection of records | Partial |
| A.6.3 Security awareness and training | Implemented |
| A.6.8 Reporting of information security events | Implemented |
| A.7.1 Physical security perimeters | Implemented |
| A.7.8 Equipment siting and protection | Implemented |
| A.8.2 Privileged access rights | Partial |
| A.8.3 Information access restriction | Implemented |
| A.8.5 Secure authentication | Implemented |
| A.8.7 Protection against malware | Implemented |
| A.8.9 Configuration management | Implemented |
| A.8.11 Data masking | Implemented |
| A.8.12 Data leakage prevention | Implemented |
| A.8.20 Networks security | Implemented |
| A.8.24 Use of cryptography | Implemented |
| A.8.28 Secure coding | Implemented |

---

## Review History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-07-02 | Kim Harjamäki | Initial controls mapping |
