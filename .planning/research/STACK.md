# Technology Stack

**Project:** LinkedIn MCP Server (OgeonX AI)
**Researched:** 2026-06-30
**Spec target:** MCP 2025-06-18

---

## Recommended Stack

### MCP SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | 1.x (latest: v1.29.0) | Core MCP protocol — McpServer, tool registration, JSON-RPC | Only official TypeScript SDK; Anthropic-maintained; 983+ code snippets in docs; no credible alternative |
| `@modelcontextprotocol/node` | bundled with SDK | `NodeStreamableHTTPServerTransport` — wraps Node.js IncomingMessage/ServerResponse | Required for Streamable HTTP transport; first-party |
| `@modelcontextprotocol/express` | bundled with SDK | `createMcpExpressApp()`, Host header validation, `mcpAuthMetadataRouter`, `requireBearerAuth` | First-party express middleware for MCP; handles Origin validation and `/.well-known/oauth-protected-resource` out of the box |

**Confidence: HIGH** — verified via Context7 against the official SDK repo (typescript-sdk main branch).

**Key architectural point:** The MCP 2025-06-18 spec uses **Streamable HTTP** as the transport, not the old HTTP+SSE. The old SSE transport (2024-11-05) is deprecated. The new transport still delivers SSE streams in responses, but the endpoint is a single `/mcp` path that accepts both POST (requests) and GET (SSE listen). Use `NodeStreamableHTTPServerTransport` with `McpServer`, not any third-party SSE library.

---

### HTTP Framework

**Recommendation: Express via `@modelcontextprotocol/express`**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `express` | 4.x | HTTP server, OAuth callback routes, health endpoint | First-party MCP middleware targets Express; `createMcpExpressApp()` ships DNS-rebinding protection (Origin/Host header validation) pre-wired; battle-tested ecosystem for OAuth flows |

Alternatives considered:

| Framework | Status | Verdict |
|-----------|--------|---------|
| Hono | `@modelcontextprotocol/hono` also exists in the SDK | Viable if you want edge/multi-runtime later, but adds complexity now without benefit for a Node.js Azure Container App |
| Fastify | `@modelcontextprotocol/fastify` also exists in the SDK | Faster than Express but meaningless advantage for an OAuth + LinkedIn API server where network I/O dominates; adds plugin boilerplate |
| Raw `node:http` | Supported via `toNodeHandler()` | No middleware ecosystem; you'd rebuild OAuth callback routing, body parsing, and error handling from scratch |

**Confidence: HIGH** — MCP SDK officially ships Express/Hono/Fastify adapters; Express is the path of least resistance for this use-case.

---

### OAuth 2.0 / OIDC

**Recommendation: `openid-client` v6 (panva)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `openid-client` | v6.8.4 | Authorization Code + PKCE, token exchange, refresh token grant, OIDC userinfo | OpenID Certified; runtime-agnostic (works in Node.js, Deno, Cloudflare Workers); v6 is a complete rewrite with clean Web Crypto API; `client.randomPKCECodeVerifier()` + `client.calculatePKCECodeChallenge()` built-in; `authorizationCodeGrant()` and `refreshTokenGrant()` cover the full LinkedIn flow |

LinkedIn uses standard Authorization Code + PKCE (it supports PKCE as of the Sign In with LinkedIn v2 product). `openid-client` is the best-maintained library in the Node.js ecosystem for this.

Alternatives considered:

| Library | Verdict |
|---------|---------|
| `simple-oauth2` | OAuth 2.0 only (no OIDC), no built-in PKCE helpers, less actively maintained |
| `passport` + `passport-linkedin-oauth2` | Adds a middleware abstraction layer that fights with the MCP server's own auth flow; the LinkedIn strategy is community-maintained and often lags LinkedIn API changes |
| Manual `fetch` + crypto | Viable but error-prone; you'd re-implement state/verifier generation, token storage, and refresh — exactly what openid-client gives you |

**Confidence: HIGH** — verified via Context7 (openid-client v6.8.4 docs) and oauth.net/code/nodejs recommendations.

**Important:** The MCP SDK's `OAuthClientProvider` interface (used on the *client* side) is separate from the server-side LinkedIn OAuth flow. This project acts as an OAuth resource server to ChatGPT (using `requireBearerAuth` from `@modelcontextprotocol/express`) AND as an OAuth client to LinkedIn (using `openid-client`). These are two distinct auth legs.

---

### LinkedIn API Client

**Recommendation: Raw `fetch` (native Node.js 18+)**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native `fetch` | Node.js 18+ built-in | LinkedIn v2 API calls (`/v2/userinfo`, `/v2/ugcPosts`) | LinkedIn's API surface for this project is tiny (2 endpoints for MVP). Native fetch is zero-dependency and sufficient. |

Alternatives considered:

| Option | Verdict |
|--------|---------|
| `linkedin-api-js-client` (official) | Beta, last release v0.3.0 on Feb 7 2023, not updated since. Do not use. |
| `axios` | Adds a dependency for no gain over native fetch; fine to add later if interceptors/retry logic become complex |
| `node-linkedin-v2` (npm) | Last published 6 years ago. Dead. |

LinkedIn API calls in this project are straightforward REST calls with bearer token headers. Use `fetch` with a thin wrapper function that injects the access token and handles 401/429 responses.

**Confidence: HIGH** — official LinkedIn SDK is confirmed beta/stale; native fetch is well-established for simple REST integration.

---

### Token Storage (local dev / MVP)

**Recommendation: File-based JSON store (`node:fs`, plain JSON)**

| Technology | Purpose | Why |
|------------|---------|-----|
| `node:fs` / JSON file | Persist LinkedIn access + refresh tokens between server restarts | Zero dependencies; readable for debugging; acceptable for single-user MVP where the token file lives on a trusted local machine |

Token file path: `~/.ogeonx/linkedin-tokens.json` (outside the project directory, not committed to git).

Alternatives considered:

| Option | Verdict |
|--------|---------|
| In-memory only | Tokens lost on every server restart during development — forces re-auth constantly. Avoid. |
| `better-sqlite3` | Overkill for a single token record; adds native compilation dependency |
| `keytar` (OS keychain) | Best for production secrets, but requires native binaries and doesn't work headlessly in Docker/Azure; defer to production phase |
| Redis / external store | Production pattern; not warranted for local dev MVP |

For **production (Azure Container Apps):** store tokens in Azure Key Vault or pass as environment variables via Azure Managed Identity. The file-based store is dev-only.

**Confidence: MEDIUM** — standard pattern for single-user local dev; no single authoritative source. Consistent with how other single-user MCP servers handle this.

---

### TypeScript Build Tooling

**Recommendation: `tsx` for development, `tsup` for production build**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `tsx` | latest | Dev server — `tsx watch src/index.ts` | Zero-config TypeScript execution with file watching; no compilation step in development; fastest iteration loop |
| `tsup` | latest | Production build — `tsup src/index.ts --format cjs` | Built on esbuild (45x faster than tsc); zero-config defaults; single bundled output for Docker |
| `tsc --noEmit` | TypeScript 5.x | Type checking in CI | esbuild/tsup skip type checking entirely; tsc is irreplaceable for this |

**TypeScript configuration:**
- `"strict": true` — non-negotiable; catches the exact class of bugs (undefined tokens, wrong API shapes) that cause silent failures in OAuth flows
- `"target": "ES2022"` — Node.js 18+ supports all ES2022 features natively
- `"moduleResolution": "bundler"` — correct for tsup-bundled output

**Confidence: HIGH** — verified against current TypeScript tooling docs; tsx + tsup is the dominant pattern for TypeScript Node.js servers in 2025.

---

### Environment Configuration

**Recommendation: `dotenv` + `zod` schema validation**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `dotenv` | 16.x | Load `.env` file into `process.env` | Standard; zero configuration |
| `zod` | 3.x | Validate and type `process.env` at startup | App fails immediately with a readable error if `LINKEDIN_CLIENT_SECRET` is missing, rather than failing silently at the first API call |

Pattern: create `src/config.ts` that calls `dotenv.config()`, then `z.object({...}).parse(process.env)` and exports the typed config object. Import from `config.ts` everywhere — never read `process.env` directly in business logic.

**Do not use `@t3-oss/env-nextjs`** — that package is Next.js-specific and not relevant here.

**Confidence: HIGH** — zod + dotenv is the dominant pattern for TypeScript Node.js env validation.

---

## Full Install Commands

```bash
# Core MCP
npm install @modelcontextprotocol/sdk @modelcontextprotocol/node @modelcontextprotocol/express

# HTTP server
npm install express
npm install -D @types/express

# OAuth
npm install openid-client

# Environment config
npm install dotenv zod

# Dev tooling
npm install -D typescript tsx tsup
npm install -D @types/node
```

---

## What NOT to Use and Why

| Technology | Reason to Avoid |
|------------|----------------|
| Old `SSEServerTransport` from `@modelcontextprotocol/sdk` (pre-2025) | Deprecated; ChatGPT targets MCP 2025-06-18 which uses Streamable HTTP. Using the old transport means ChatGPT won't connect. |
| `passport` / `passport-linkedin-oauth2` | Community-maintained LinkedIn strategy is behind LinkedIn v2 API; Passport's middleware model collides with MCP server's auth flow architecture |
| `linkedin-api-js-client` (official) | Beta since 2022, last release Feb 2023, subject to breaking changes with no maintenance commitment |
| `axios` | Unnecessary dependency; native `fetch` is available in Node.js 18+ and sufficient for 2 API endpoints |
| `@t3-oss/env-nextjs` | Next.js-only; not relevant |
| NestJS | Heavy abstraction layer; adds significant complexity for no benefit in a single-purpose MCP server |
| Bun runtime | Azure Container Apps support for Bun is immature; stick to Node.js 20 LTS for production target |

---

## Alternatives Considered (Summary)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| MCP SDK | `@modelcontextprotocol/sdk` | None — no credible alternative exists | Only official SDK |
| HTTP framework | Express + `@modelcontextprotocol/express` | Hono, Fastify | Both have first-party MCP adapters but no advantage for a Node.js-only server; Express wins on familiarity and documentation coverage for OAuth patterns |
| OAuth library | `openid-client` v6 | `simple-oauth2`, `passport` | openid-client is OpenID Certified and the only library with built-in PKCE helpers and OIDC userinfo support |
| LinkedIn API client | Native `fetch` | `axios`, official SDK | Official SDK is stale; axios is unnecessary; fetch is sufficient |
| Token storage (dev) | File-based JSON | SQLite, keytar, in-memory | Simplest option that survives restarts; keytar/KV deferred to production |
| Build tool | `tsup` (prod) + `tsx` (dev) | `tsc`, `esbuild` directly | tsup wraps esbuild with good defaults; tsx eliminates dev build step entirely |
| Env config | `dotenv` + `zod` | `envalid`, `convict` | Zod is already used for type validation elsewhere; consistent tooling |

---

## Sources

- MCP TypeScript SDK (Context7): `/modelcontextprotocol/typescript-sdk` — HIGH confidence
- MCP Transports spec (official): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports — HIGH confidence
- openid-client v6 (Context7): `/panva/openid-client` v6.8.4 — HIGH confidence
- oauth.net Node.js libraries: https://oauth.net/code/nodejs/ — MEDIUM confidence
- LinkedIn API JS Client (GitHub): https://github.com/linkedin-developers/linkedin-api-js-client — HIGH confidence (confirmed stale)
- tsup documentation: https://tsup.egoist.dev/ — HIGH confidence
- WebSearch: framework comparisons (Hono/Express/Fastify) — MEDIUM confidence (performance claims from third-party benchmarks)
