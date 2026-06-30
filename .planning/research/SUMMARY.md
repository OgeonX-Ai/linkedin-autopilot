# Research Summary -- LinkedIn MCP Server

**Project:** LinkedIn MCP Server (OgeonX AI)
**Domain:** OAuth-brokered MCP integration between ChatGPT and LinkedIn v2 API
**Researched:** 2026-06-30
**Confidence:** HIGH

---

## Executive Summary

This project is a TypeScript/Node.js MCP server (spec 2025-06-18, Streamable HTTP transport) acting as an OAuth broker between ChatGPT and LinkedIn. The core complexity is a two-leg OAuth flow: our server is an Authorization Server toward ChatGPT (issuing our own JWTs) and simultaneously an OAuth client toward LinkedIn (using openid-client v6). LinkedIn tokens are held server-side and ChatGPT never sees them, as mandated by the MCP spec Token Passthrough prohibition.

The approved LinkedIn API surface is deliberately narrow. Sign In with LinkedIn (OIDC) and Share on LinkedIn together cover four v1 tools: getAuthStatus, getProfile, postUpdate, and deletePost. Everything else -- connections, messaging, analytics, events -- requires partner program access not granted and will return 401/403. Build only what the approved scopes support.

The top risks concentrate in OAuth and LinkedIn API quirks: ngrok URL rotation breaks redirect URI registration before work begins; wrong scope names (r_liteprofile) cause immediate 401s; ugcPosts requires X-Restli-Protocol-Version: 2.0.0 and a namespaced body structure; ChatGPT creates a fresh MCP session per tool call so server-side state must be keyed to LinkedIn sub, not Mcp-Session-Id. Validate OAuth end-to-end in a browser before building any tool.

---

## Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|----------- |
| MCP SDK | @modelcontextprotocol/sdk >= 1.24.0 | Only official TypeScript SDK; 1.24.0 fixes DNS rebinding Origin validation CVE |
| HTTP transport | NodeStreamableHTTPServerTransport | Required for MCP 2025-06-18; old SSEServerTransport is deprecated and ChatGPT-incompatible |
| HTTP framework | Express + @modelcontextprotocol/express | createMcpExpressApp() ships Origin/Host validation and /.well-known discovery routes pre-wired |
| OAuth client (LinkedIn leg) | openid-client v6.8.4 | OpenID Certified; authorizationCodeGrant() and refreshTokenGrant() cover full flow |
| LinkedIn API client | Native fetch() Node.js 18+ | Official LinkedIn SDK dead (last release Feb 2023); two endpoints do not justify a dependency |
| Token storage (dev) | File-based JSON at ~/.ogeonx/linkedin-tokens.json | Zero-dependency; survives restarts; outside project dir; prod uses Azure Key Vault |
| Environment config | dotenv + zod | Fails fast at startup on missing secrets; typed config object everywhere |
| Build tooling | tsx (dev) + tsup (prod) + tsc --noEmit (CI) | Zero-config TS execution in dev; esbuild-speed bundle for prod; strict type checking in CI |

**Do not use:** SSEServerTransport, passport-linkedin-oauth2, linkedin-api-js-client, axios, NestJS, Bun runtime.

---

## Table Stakes Features (v1)

| Priority | Tool | API | Why Non-Negotiable |
|----------|------|-----|--------------------|
| 1 | getAuthStatus | Token store only (no LinkedIn call) | Every other tool depends on auth; first smoke test |
| 2 | getProfile | GET /v2/userinfo | Validates OIDC flow; returns sub needed for author URN |
| 3 | postUpdate | POST /v2/ugcPosts | Core value delivery: text posts + optional articleUrl |
| 4 | deletePost | DELETE /v2/ugcPosts/{id} | Highest-value differentiator; AI posting without undo is a UX dealbreaker |

**Approved scopes (use exactly):** openid profile email w_member_social

**Deferred to v2+:** getMyPosts (r_member_social not self-serve, 403 guaranteed); createEvent (partner-only despite approved status); imagePost (binary upload complexity); schedulePost (needs queue infrastructure); all connection/messaging/analytics/job tools (partner-only).

**Rate limit:** 150 posts/member/day, resets midnight UTC. Surface 429 as human-readable error.

---

## Architecture in One Page

### Component Map

```
ChatGPT (MCP Client)
    | POST/GET /sse  (Streamable HTTP - JSON-RPC + SSE)
    | Authorization: Bearer <our-JWT>
    v
+-----------------------------------------------------+
|  Express + @modelcontextprotocol/express            |
|  Transport Layer (NodeStreamableHTTPServerTransport)|
|  - Origin validation, session ID routing            |
|  Auth Layer (requireBearerAuth)                     |
|  - Verifies our JWT, extracts linkedInSessionId     |
|  Tool Registry (McpServer.registerTool)             |
|  - getAuthStatus, getProfile, postUpdate, deletePost|
|  LinkedIn API Client (native fetch)                 |
|  - Token injection, X-Restli header, error norm.   |
|  OAuth Routes (/auth/authorize, /callback, /token)  |
|  - AS toward ChatGPT, OAuth client toward LinkedIn  |
|  Session Store (in-memory Map with TTL)             |
|  - state2 -> OAuthState (10m TTL)                  |
|  - ourCode -> AuthCode (2m TTL)                     |
|  - linkedInSessionId -> LinkedInSession             |
+-----------------------------------------------------+
    | Standard OAuth 2.0 + OIDC (client_secret flow)
    v
LinkedIn v2 API (/v2/userinfo, /v2/ugcPosts)
```

### Two-Leg OAuth Flow (the core complexity)

```
Step 1  ChatGPT -> GET /.well-known/oauth-protected-resource (discovery)
Step 2  ChatGPT -> GET /auth/authorize  (ChatGPT PKCE flow to our server)
Step 3  Server generates state2 UUID, stores {chatgptState, codeChallenge, TTL=10m}
        Server -> 302 -> LinkedIn OAuth (client_secret flow; PKCE NOT active on LinkedIn)
Step 4  User approves -> LinkedIn -> GET /auth/callback?code=X&state=state2
        Server: exchanges code, stores LinkedIn tokens + sub, generates ourCode
        Server -> 302 -> chatgptRedirectUri?code=ourCode&state=chatgptState
Step 5  ChatGPT -> POST /auth/token (PKCE verify, server issues our JWT)
Step 6  ChatGPT -> POST /sse + Authorization: Bearer <our-JWT>
        Server: verify JWT -> linkedInSessionId -> LinkedIn tokens -> API call
```

**Key state rules:** state2 TTL = 10m (binds LinkedIn callback to ChatGPT request); Mcp-Session-Id is NOT the OAuth session -- decouple completely; key ALL state to LinkedIn sub, never to Mcp-Session-Id.

### Build Order

1. config/index.ts (env validation; everything reads from here)
2. session/store.ts + session/types.ts (pure data structures)
3. auth/pkce.ts -> tokenVerifier.ts -> metadataRoutes.ts -> oauthRoutes.ts
4. server/app.ts -> sessionTransport.ts
5. linkedin/errors.ts -> tokenManager.ts -> client.ts
6. tools/getProfile.ts + postUpdate.ts + deletePost.ts -> tools/index.ts
7. server/mcpHandler.ts -> index.ts

**Critical rule:** Validate OAuth end-to-end in a browser before writing any tool handler.

---

## Top 10 Pitfalls

Ordered by blast radius, most dangerous first.

| # | Pitfall | Prevention |
|---|---------|------------|
| 1 | Client secret committed to Git: permanent credential exposure | .gitignore must include .env BEFORE git init; pre-commit secret-scan hook before first add |
| 2 | Wrong OAuth scopes (r_liteprofile): 401 on every auth request | Use exactly: openid profile email w_member_social; verify in Developer Portal Auth tab first |
| 3 | PKCE not active on LinkedIn: code_challenge silently ignored | Use client_secret flow for LinkedIn leg; PKCE only on ChatGPT-to-our-server leg; document decision |
| 4 | ugcPosts missing X-Restli-Protocol-Version: 2.0.0: 400 with misleading error | Add as default header in LinkedIn client constructor; never omit it |
| 5 | Author URN uses deprecated urn:li:member: prefix: 401 on every postUpdate | Always urn:li:person:{sub}; capture sub from /v2/userinfo during OAuth callback not lazily |
| 6 | ngrok subdomain changes on restart: breaks redirect URI registration | Use Cloudflare Tunnel (free permanent subdomain) from day zero; register before writing auth code |
| 7 | ChatGPT creates fresh MCP session per tool call: session-keyed state silently lost | Key ALL state to LinkedIn sub (userId); never use Mcp-Session-Id as a cache key |
| 8 | Origin header validation absent: DNS rebinding attack vector | Use SDK >= 1.24.0; configure allowedOrigins; integration test bad Origin -> expect 403 |
| 9 | Refresh tokens are partner feature: no silent renewal after 60-day access token expiry | Check if App 260420654 has refresh tokens; implement graceful re-auth fallback regardless |
| 10 | ugcPosts namespaced body structure: 422 with no useful context | media: [] and attributes: [] required even when empty; post ID in x-restli-id header not body; wait 10+ min between identical test posts |

---

## Implications for Roadmap

### Phase 0 - Dev Environment Setup

**Rationale:** LinkedIn requires HTTPS redirect URIs; ngrok URL rotation kills OAuth iteration velocity; secrets must be excluded from git before the first commit.

**Delivers:** Stable Cloudflare Tunnel URL registered in LinkedIn Developer Portal; .gitignore with secrets blocked; pre-commit hook installed.

**Avoids:** Pitfalls 1, 6.

**Research flag:** Standard patterns -- skip /gsd-research-phase.

### Phase 1 - Foundation + Two-Leg OAuth

**Rationale:** OAuth is the critical path. Tools cannot run without verified LinkedIn tokens. Discovering OAuth issues after tool work begins is a rewrite trigger.

**Delivers:** Working end-to-end OAuth flow verified in browser; ChatGPT can authenticate and receive our JWT; LinkedIn tokens and sub stored.

**Avoids:** Pitfalls 2, 3, 7, 8.

**Research flag:** Standard OAuth 2.1 well-documented -- skip /gsd-research-phase.

### Phase 2 - Core Tools (getAuthStatus + getProfile + postUpdate)

**Rationale:** getAuthStatus is the smoke test; getProfile validates OIDC and surfaces sub; postUpdate is the primary value delivery.

**Delivers:** Three working MCP tools callable from ChatGPT; LinkedIn post creation confirmed in production.

**Avoids:** Pitfalls 4, 5, 10.

**Research flag:** ugcPosts structure fully documented in PITFALLS.md -- skip /gsd-research-phase.

### Phase 3 - deletePost + Error Hardening

**Rationale:** Highest-value differentiator at lowest complexity; error hardening needed before production exposure.

**Delivers:** deletePost tool with destructiveHint: true; Authorization header redaction in all log paths; graceful re-auth fallback when refresh token absent.

**Avoids:** Pitfall 9 (re-auth fallback), access token in logs (60-day credentials).

**Research flag:** Standard patterns -- skip /gsd-research-phase.

### Phase 4 - Production Deployment (Azure Container Apps)

**Rationale:** Replace dev scaffolding with production-grade infrastructure.

**Delivers:** Live server on Azure Container Apps; Azure Key Vault for secrets; production redirect URIs registered; TLS via Azure built-in.

**Avoids:** N/A (no pitfalls from Phase 0-3 apply here).

**Research flag:** Azure Container Apps + Key Vault + Managed Identity + Redis session affinity for MCP servers is sparse -- FLAG for /gsd-research-phase.

### Research Flags Summary

**Needs /gsd-research-phase:** Phase 4 (Azure production deployment patterns for MCP servers).

**Standard patterns, skip research:** Phase 0 (dev tooling), Phase 1 (OAuth 2.1 -- MCP spec authoritative), Phase 2-3 (LinkedIn API + tools -- fully documented in research files).

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All choices verified against official SDK source and confirmed LinkedIn API status |
| Features | HIGH | Scope boundaries confirmed from LinkedIn Developer Portal product catalog |
| Architecture | HIGH | Derived directly from MCP 2025-06-18 spec and TypeScript SDK source |
| Pitfalls | HIGH | All claims verified against official LinkedIn docs and MCP spec CVE disclosures |

**Overall confidence:** HIGH

### Open Questions

| Question | Impact | Resolution |
|----------|--------|------------|
| Does App 260420654 have programmatic refresh tokens enabled? | HIGH: if not, 60-day expiry requires user re-auth | Check Developer Portal Auth tab day one; implement re-auth fallback regardless |
| Is PKCE active on LinkedIn OAuth endpoint for this app? | MEDIUM: affects LinkedIn-leg security posture | Default to client_secret flow; contact LinkedIn support to verify |
| What is the actual app-level daily rate limit for App 260420654? | MEDIUM: affects multi-user production scale | Make 1 call post-deploy; check Developer Portal Analytics tab |
| Does ChatGPT send Mcp-Session-Id on subsequent requests? | MEDIUM: determines whether stateful transport adds value | Test empirically in Phase 1; key state to sub regardless |

---

## Sources

### Primary (HIGH confidence)
- @modelcontextprotocol/typescript-sdk via Context7: transport, auth middleware, McpServer API
- MCP 2025-06-18 transports spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP 2025-06-18 authorization spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- openid-client v6.8.4 via Context7: OAuth client patterns
- LinkedIn UGC Post API (Microsoft Learn, official): ugcPosts body structure, headers, error codes
- LinkedIn OAuth 2.0 docs (official, updated 2026-05-15): scope names, redirect URI rules, token TTLs
- LinkedIn Rate Limiting (official, updated 2025-08-20)
- MCP DNS rebinding CVE: https://vulnerablemcp.info/vuln/cve-2025-66414-66416-dns-rebinding-mcp-sdks.html

### Secondary (MEDIUM confidence)
- ChatGPT MCP session behavior: https://medium.com/@ylenius/openais-mcp-session-problem-and-how-we-worked-around-it-7b40d1b19710
- Tigris MCP OAuth broker pattern: https://www.tigrisdata.com/blog/mcp-oauth/
- LinkedIn OAuth2 setup notes 2025: https://medium.com/@ed.sav/setting-up-linkedin-oauth-few-notes-2025-0097ac858157

---
*Research completed: 2026-06-30*
*Ready for roadmap: yes*
