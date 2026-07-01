# OgeonX LinkedIn Autopilot

> Automate your LinkedIn presence with any AI — post AI news, thought leadership, articles, and job listings automatically.

Built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — connect any modern AI agent to LinkedIn and let it post, search jobs, and run scheduled content routines on your behalf.

## Works with all major AI platforms

| Platform | Protocol | Auth | Setup |
|----------|----------|------|-------|
| **Claude Code** (Anthropic) | HTTP `/routine/*` | Bearer JWT | [Claude setup →](#claude-code-routines) |
| **OpenAI Codex** | MCP Streamable HTTP | OAuth 2.0 | [Codex setup →](#openai-codex) |
| **Google Agentspace** | MCP + OpenAPI | API Key | [Agentspace setup →](#google-agentspace) |
| **ChatGPT Custom GPTs** | MCP Streamable HTTP | OAuth 2.0 | [ChatGPT setup →](docs/CHATGPT_SETUP.md) |
| **n8n / Zapier / Make** | REST `/routine/*` | API Key | Set `X-API-Key` header |

---

## What it does

| Tool | Description |
|------|-------------|
| `getProfile` | Fetch your LinkedIn profile |
| `postUpdate` | Post any text to LinkedIn |
| `postAINews` | Auto-curate + post trending AI news from RSS |
| `postThoughtLeadership` | Wednesday opinion-style post (drives comments) |
| `postWeeklyRoundup` | Friday top-5 AI stories digest |
| `postArticle` | Long-form article with optional rich URL preview |
| `getRecentCommits` | Read your git history, compose a dev update post |
| `searchJobs` | Search Finnish + remote jobs (Indeed FI + Remotive) |

---

## Architecture

```
ChatGPT
  │  OAuth 2.0 (your app acts as Authorization Server)
  ▼
LinkedIn Autopilot Server  (Hono + Node.js, TypeScript)
  │
  ├── /mcp          ← MCP Streamable HTTP (2025-06-18)
  ├── /auth/*       ← LinkedIn OAuth for browser
  ├── /oauth/*      ← OAuth AS endpoints for ChatGPT
  ├── /routine/*    ← Bearer-JWT HTTP endpoints for scheduled tasks
  ├── /             ← Landing page (multi-user onboarding)
  └── /admin/users  ← Connected user dashboard
  │
  ▼
LinkedIn API v2 (/v2/posts — new 2025 Posts API)
```

**Key design decisions:**
- Two-leg OAuth: server holds LinkedIn tokens, ChatGPT gets short-lived JWTs
- Session + user registry persisted as JSON files (no database required)
- JWT signed with Node built-in `crypto` (no external deps)
- All LinkedIn headers enforced in one place (`linkedinFetch`) — callers can't bypass them
- `spawnSync` for git commands (no shell injection — args as array, no string interpolation)

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/OgeonX-Ai/linkedin-autopilot
cd linkedin-autopilot
npm install
```

### 2. Create a LinkedIn app

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)
2. Create a new app
3. Under **Auth**, add two redirect URLs:
   - `https://YOUR_TUNNEL_URL/auth/callback`
   - `https://YOUR_TUNNEL_URL/oauth/callback`
4. Request these OAuth scopes: `openid`, `profile`, `email`, `w_member_social`
5. Copy **Client ID** and **Client Secret**

### 3. Set environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
SESSION_SECRET=at_least_32_random_characters_here
PORT=3000
ALLOWED_ORIGINS=https://chatgpt.com
LINKEDIN_REDIRECT_URI=https://YOUR_TUNNEL_URL/auth/callback
SERVER_URL=https://YOUR_TUNNEL_URL

# Optional: enable admin dashboard at /admin/users?secret=xxx
ADMIN_SECRET=your_admin_secret
```

Generate a strong `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Start a Cloudflare Tunnel

```bash
# Install cloudflared once
winget install Cloudflare.cloudflared   # Windows
brew install cloudflared                # Mac

# Start tunnel (gives you a free HTTPS URL)
cloudflared tunnel --url http://localhost:3000
```

Copy the `https://*.trycloudflare.com` URL into your `.env` as `SERVER_URL` and `LINKEDIN_REDIRECT_URI`.

### 5. Run the server

```bash
npm run dev        # development (tsx watch)
npm run build      # production build
npm start          # run built output
```

Visit `http://localhost:3000` — you'll see the landing page.

---

## Connect to ChatGPT

1. Open ChatGPT → Explore GPTs → your GPT → Edit → Add action
2. Import OpenAPI schema from:
   ```
   https://YOUR_TUNNEL_URL/.well-known/openapi.json
   ```
3. Set authentication type: **OAuth**
   - Client ID: your LinkedIn Client ID
   - Client Secret: your LinkedIn Client Secret
   - Authorization URL: `https://YOUR_TUNNEL_URL/oauth/authorize`
   - Token URL: `https://YOUR_TUNNEL_URL/oauth/token`
   - Scope: `openid profile email w_member_social`
4. Save the GPT, click **Sign in with LinkedIn**, authorize

---

## Scheduled routines

Get a 30-day token for automated posting:

1. Visit `https://YOUR_TUNNEL_URL/auth/login` in your browser
2. Authorize with LinkedIn
3. Visit `https://YOUR_TUNNEL_URL/routine/token` — copy the JWT

Use the token as `Authorization: Bearer <token>` when calling routine endpoints:

| Endpoint | Recommended schedule |
|----------|----------------------|
| `POST /routine/post-ai-news` | Mon/Tue/Thu 10:00 EET |
| `POST /routine/post-thought-leadership` | Wed 11:00 EET |
| `POST /routine/post-weekly-roundup` | Fri 10:00 EET |

### Claude Desktop scheduled tasks

In Claude Desktop settings, create a scheduled task with prompt:
```
Call POST https://YOUR_TUNNEL_URL/routine/post-ai-news
with header Authorization: Bearer YOUR_TOKEN
```

---

## Claude Code routines

The three routines shown in your Claude Code sidebar call the server's HTTP endpoints directly with a Bearer JWT — no MCP overhead needed.

**Setup:**
1. Visit `https://YOUR_TUNNEL_URL/auth/login` → authorize LinkedIn
2. Visit `https://YOUR_TUNNEL_URL/routine/token` → copy the 30-day JWT
3. In Claude Code → Routines → New routine, set prompt:
```
POST https://YOUR_TUNNEL_URL/routine/post-ai-news
Authorization: Bearer YOUR_JWT_TOKEN
```

**Recommended schedule:**
- Monday 10:00 EET — AI news
- Wednesday 11:00 EET — Thought leadership
- Friday 10:00 EET — Weekly roundup

---

## OpenAI Codex

Codex CLI supports MCP servers natively. Add this to your Codex config (`~/.codex/config.yaml`):

```yaml
mcpServers:
  linkedin-autopilot:
    type: sse
    url: https://YOUR_TUNNEL_URL/mcp
    headers:
      Authorization: Bearer YOUR_JWT_TOKEN
```

Then use it:
```bash
codex "Post today's AI news to my LinkedIn"
codex "Search for senior DevOps jobs in Helsinki"
codex "Write a thought leadership post about AI trends in Finland"
```

---

## Google Agentspace

Google Agentspace reads the OpenAPI spec and calls the REST endpoints directly.

**Setup:**
1. Generate an API key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
2. Add to `.env`: `API_KEYS=your-generated-key`
3. In Google Agentspace → Add connector:
   - OpenAPI URL: `https://YOUR_TUNNEL_URL/openapi.json`
   - Auth: API Key → Header `X-API-Key` → paste your key

Agentspace can then trigger all 5 routine endpoints via natural language.

---

## Multi-user / SaaS mode

Anyone can self-onboard:
1. Share your tunnel URL
2. They visit the landing page → "Connect Your LinkedIn"
3. They authorize → get their own JWT token from `/routine/token`
4. They set up their own scheduled tasks

All users are stored in `.users.json`. View all connected users:
```
GET /admin/users?secret=YOUR_ADMIN_SECRET
```

---

## Security

- `LINKEDIN_CLIENT_SECRET` never logged or exposed in responses
- `sanitizeErrors` middleware redacts secrets from all error output
- CSRF state uses `timingSafeEqual` (not `===`)
- Session cookies: HttpOnly, SameSite=Lax
- Git commands use `spawnSync` with args array (no shell injection)
- Origin guard validates all incoming requests
- JWT signed with HS256 using Node built-in `crypto`

---

## Development

```bash
npm run dev       # watch mode
npm test          # vitest (50 tests)
npm run build     # tsup bundle
npm run lint      # eslint
```

### Project structure

```
src/
├── index.ts                  # Entry point — mounts all routes
├── config.ts                 # Env validation + exports
├── auth/
│   ├── cookie.ts             # HMAC-signed session cookies
│   ├── jwt.ts                # HS256 JWT sign/verify (Node crypto)
│   ├── linkedin.ts           # LinkedIn OAuth helpers
│   ├── session.ts            # In-memory session store
│   ├── session-persist.ts    # .sessions.json persistence
│   └── user-registry.ts      # Multi-user registry (.users.json)
├── routes/
│   ├── auth.ts               # /auth/* — browser OAuth flow
│   ├── oauth.ts              # /oauth/* — ChatGPT OAuth AS
│   ├── mcp.ts                # /mcp — MCP Streamable HTTP
│   ├── routine.ts            # /routine/* — scheduled HTTP endpoints
│   ├── well-known.ts         # /.well-known/* — discovery docs
│   ├── landing.ts            # / — onboarding landing page
│   └── admin.ts              # /admin/* — user dashboard
├── linkedin/
│   └── client.ts             # LinkedIn API client (Posts API 2025)
├── mcp/
│   └── server.ts             # MCP tool registration
├── tools/
│   ├── get-profile.ts
│   ├── post-update.ts
│   ├── post-ai-news.ts
│   ├── post-thought-leadership.ts
│   ├── post-weekly-roundup.ts
│   ├── post-article.ts
│   ├── search-jobs.ts
│   └── get-recent-commits.ts
└── middleware/
    ├── require-auth.ts
    └── sanitize-errors.ts
```

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `LINKEDIN_CLIENT_ID` | ✅ | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | ✅ | LinkedIn app client secret |
| `SESSION_SECRET` | ✅ | Min 32 chars — signs JWTs and session cookies |
| `PORT` | — | HTTP port (default: 3000) |
| `SERVER_URL` | ✅ | Your public HTTPS URL (tunnel or domain) |
| `LINKEDIN_REDIRECT_URI` | ✅ | Must be `SERVER_URL/auth/callback` |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS origins (default: `https://chatgpt.com`) |
| `ADMIN_SECRET` | — | Enables `/admin/users` endpoint |
| `API_KEYS` | — | Comma-separated pre-shared keys for Google Agentspace / n8n / Zapier |

---

## Documentation

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to add tools, code style, PR checklist |
| [SECURITY.md](SECURITY.md) | Security model, token handling, incident response |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagram, OAuth flow, session lifecycle |
| [docs/CHATGPT_SETUP.md](docs/CHATGPT_SETUP.md) | Step-by-step ChatGPT Custom GPT setup |
| [docs/LINKEDIN_STRATEGY.md](docs/LINKEDIN_STRATEGY.md) | Algorithm 2026, customer acquisition, job search |
| [docs/iso27001/](docs/iso27001/) | ISO 27001 ISMS — risk register, controls, incident response |

---

## License

MIT — build on it, sell it, ship it.
