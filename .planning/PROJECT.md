# LinkedIn MCP Server — OgeonX AI

## What This Is

An enterprise-grade MCP (Model Context Protocol) server that bridges ChatGPT with LinkedIn. Users activate a ChatGPT App, which sends JSON-RPC requests over HTTP/SSE to our MCP backend, which authenticates via LinkedIn OAuth 2.0/OIDC and calls LinkedIn v2 APIs on the user's behalf.

**Core value:** A ChatGPT user says "post this to LinkedIn" or "show me my profile" — it just works. No manual token copying, no separate LinkedIn tab. The MCP server handles auth, API calls, and error recovery transparently.

## Context

- **Owner:** Kim Harjamäki / OgeonX AI
- **LinkedIn App ID:** 260420654
- **Approved LinkedIn products:** Sign In with LinkedIn (OIDC), Share on LinkedIn, Events Management API
- **Runtime:** TypeScript / Node.js
- **Deployment:** Local (dev/MVP phase), Azure Container Apps (production)
- **Protocol:** MCP 2025-06-18 spec — JSON-RPC over HTTP POST + SSE streaming
- **MCP endpoint:** `https://<domain>/sse` (POST for requests, GET for SSE stream)
- **Discovery:** `GET /.well-known/oauth-protected-resource`

## The Problem

LinkedIn has no native ChatGPT integration. Users who want to automate LinkedIn tasks (post content, check their profile, manage presence) must switch between apps and manage OAuth tokens manually. This project eliminates that friction by making LinkedIn a first-class ChatGPT tool.

## Who It's For

- Kim / OgeonX AI team (primary developers and initial users)
- End-users who use ChatGPT to manage their LinkedIn presence
- Future: enterprise teams automating LinkedIn content workflows

## What Done Looks Like

1. User opens ChatGPT, activates the LinkedIn app
2. First use: ChatGPT redirects to LinkedIn login/consent → user approves
3. User asks "post this update to LinkedIn" → post appears on LinkedIn
4. User asks "show my LinkedIn profile" → ChatGPT displays name, headline, email
5. Tokens refresh silently; expired sessions prompt re-auth gracefully
6. All API errors returned as readable ChatGPT messages (not stack traces)

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP server bootstrapped with TypeScript + SSE transport
- [ ] `/.well-known/oauth-protected-resource` discovery endpoint
- [ ] LinkedIn OAuth 2.0/OIDC flow (authorization code + PKCE)
- [ ] Token storage and refresh (access + refresh tokens)
- [ ] `getProfile` tool — calls `/v2/userinfo`, returns name/email/headline
- [ ] `postUpdate` tool — calls `/v2/ugcPosts`, creates text post on LinkedIn
- [ ] Origin header validation (MCP security requirement)
- [ ] HTTPS/TLS enforcement
- [ ] Graceful error handling (LinkedIn rate limits, expired tokens, API errors)
- [ ] Environment-based config (client ID/secret via env vars, never hardcoded)
- [ ] Local development setup (ngrok/tunneling for LinkedIn callback)
- [ ] ChatGPT App manifest / connector config pointing to MCP server

### Out of Scope

- Job search / apply — LinkedIn Partner API only, not approved
- Network invites / messaging — Partner API only
- Marketing / Ads APIs — not approved
- Events Management — provisioned but deferred to v2
- Image/video posts — text posts first; media posts are v2
- Multi-user tenant management — single-user MVP first

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript / Node.js | Best MCP SDK support, mature OAuth libs, easy SSE | Selected |
| MCP 2025-06-18 spec | Latest stable; ChatGPT uses this version | Fixed |
| Single `/sse` endpoint | MCP spec: POST for requests, GET for SSE stream | Fixed |
| Local deployment first | MVP focus; Azure Container Apps for production | Selected |
| YOLO execution mode | Spec is detailed, move fast | Selected |
| Standard granularity | 5-8 phases, balanced size | Selected |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-30 after initialization*
