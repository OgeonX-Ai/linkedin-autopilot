---
phase: 06-dev-experience-docs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - .env.example
  - src/config.ts
autonomous: false
requirements: [DEV-01, DEV-02]

must_haves:
  truths:
    - "A developer who has never seen this repo can clone it and follow the README to reach a working ChatGPT-to-LinkedIn integration in under 30 minutes"
    - "Every environment variable the server reads is documented in .env.example with a comment explaining where to find its value"
    - "BASE_URL is present in both src/config.ts and .env.example so redirect URI construction works at runtime"
    - "The tunnel setup section tells the developer exactly which URL to paste into LinkedIn Developer Portal and which .env field to update — before starting the server"
    - "The ChatGPT connector section gives the exact MCP endpoint URL pattern (/mcp) and auth type (OAuth 2.0) with no guesswork"
    - "The troubleshooting section covers: redirect URI mismatch, missing LinkedIn scopes, tunnel URL rotation"
    - "The README recommends Cloudflare Tunnel (permanent free subdomain) and explains why ngrok free is painful"
  artifacts:
    - path: "README.md"
      provides: "Full developer onboarding guide"
      contains: "Prerequisites, Clone and install, LinkedIn App setup, env config, tunnel setup, Start server, Connect to ChatGPT, Troubleshooting"
    - path: ".env.example"
      provides: "Template for all required environment variables"
      contains: "CLIENT_ID, CLIENT_SECRET, SESSION_SECRET, BASE_URL, PORT"
    - path: "src/config.ts"
      provides: "Zod-validated config module"
      contains: "BASE_URL"
  key_links:
    - from: ".env.example"
      to: "src/config.ts"
      via: "Every key in .env.example must match a field parsed by the Zod schema in config.ts"
      pattern: "BASE_URL"
    - from: "README.md Step 4 (tunnel)"
      to: "README.md Step 6 (ChatGPT)"
      via: "The tunnel HTTPS URL derived in Step 4 is used verbatim in the MCP endpoint URL in Step 6"
      pattern: "https://<tunnel-url>/mcp"
---

<objective>
Produce the full developer-facing documentation and verify the environment configuration is complete and self-consistent.

Purpose: A developer unfamiliar with the project must be able to clone the repo and reach a working local LinkedIn MCP integration — ready to connect to ChatGPT — without asking anyone for help. The README is the single source of truth for that journey.

Output:
- README.md — complete step-by-step developer guide (6 setup steps + troubleshooting)
- .env.example — verified to be complete and consistent with src/config.ts Zod schema
- src/config.ts — updated to include BASE_URL if missing
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/OgeonX-AI/.planning/PROJECT.md
@C:/OgeonX-AI/.planning/ROADMAP.md
@C:/OgeonX-AI/.planning/REQUIREMENTS.md
@C:/OgeonX-AI/src/config.ts
@C:/OgeonX-AI/.env.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify and patch src/config.ts and .env.example</name>
  <files>src/config.ts, .env.example</files>
  <action>
Read src/config.ts in full. Identify every environment variable parsed by the Zod schema (look for z.string(), z.number(), process.env.*).

Check whether BASE_URL is present. If it is absent:
- Add it to the Zod schema as `BASE_URL: z.string().url()` (or `z.string().min(1)` if the rest of the file uses that style).
- Place it near PORT in the schema so it is visually grouped with server-level config.
- Use the validated value when constructing the LinkedIn redirect URI: `${config.BASE_URL}/auth/callback`. If auth routes already hardcode the callback path, update them to use `config.BASE_URL` — note each file changed in the task summary.

After patching config.ts, read .env.example. Ensure it contains every key present in the Zod schema. Required keys:
- `CLIENT_ID` — LinkedIn App client ID (from LinkedIn Developer Portal > App > Auth)
- `CLIENT_SECRET` — LinkedIn App client secret (same location)
- `SESSION_SECRET` — random 64-char hex string; generation command: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `BASE_URL` — your tunnel HTTPS URL during local dev; e.g. `https://abc123.trycloudflare.com`
- `PORT` — defaults to 3000 (optional; include with comment "optional, defaults to 3000")

Each key must have an inline comment on the same line or the line above explaining where the value comes from. Required format:

```
# LinkedIn OAuth credentials — LinkedIn Developer Portal > Your App > Auth tab
CLIENT_ID=your_linkedin_client_id_here
CLIENT_SECRET=your_linkedin_client_secret_here

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=generate_a_random_64_char_hex_string

# Your tunnel HTTPS URL — Cloudflare Tunnel (permanent) or ngrok static domain
# Example: https://abc123.trycloudflare.com
BASE_URL=https://your-tunnel-subdomain.trycloudflare.com

# Optional — defaults to 3000
PORT=3000
```

Add any missing keys. Do not remove any existing keys. Write both files.
  </action>
  <verify>
    <automated>grep "BASE_URL" src/config.ts && grep -E "^(CLIENT_ID|CLIENT_SECRET|SESSION_SECRET|BASE_URL|PORT)" .env.example | wc -l</automated>
  </verify>
  <done>
- src/config.ts Zod schema includes BASE_URL
- .env.example contains CLIENT_ID, CLIENT_SECRET, SESSION_SECRET, BASE_URL, PORT — each with a comment
- No key present in the Zod schema is absent from .env.example
  </done>
</task>

<task type="auto">
  <name>Task 2: Write README.md — complete developer onboarding guide</name>
  <files>README.md</files>
  <action>
Write README.md from scratch (overwrite any existing placeholder). The file must be clean Markdown readable on GitHub. Use exactly this structure and content:

---

# LinkedIn MCP Server

Connect ChatGPT to LinkedIn. Authenticate once — then post updates, fetch your profile, and manage your LinkedIn presence from ChatGPT using natural language.

**What this does:** Runs a local MCP (Model Context Protocol) server that ChatGPT talks to over HTTP. The server handles LinkedIn OAuth 2.0 and exposes `getProfile` and `postUpdate` as ChatGPT tools.

---

## Prerequisites

- Node.js 20 or higher (`node --version`)
- A [LinkedIn Developer account](https://developer.linkedin.com) and the ability to create a LinkedIn App
- A tunnel tool — see Step 4 for options (Cloudflare Tunnel recommended)
- A ChatGPT Plus or Team account with access to custom GPT connectors

---

## Step 1: Clone and install

```bash
git clone https://github.com/your-org/linkedin-mcp-server.git
cd linkedin-mcp-server
npm install
```

---

## Step 2: Create a LinkedIn App

1. Go to [developer.linkedin.com](https://developer.linkedin.com) and sign in.
2. Click **Create App**.
3. Fill in:
   - **App name:** anything (e.g. "My LinkedIn MCP")
   - **LinkedIn Page:** associate with your personal or company page
   - **App logo:** any image (required by LinkedIn)
4. Click **Create app**.
5. Open the **Auth** tab of your new app. You will find:
   - **Client ID** — copy this; you will need it for `CLIENT_ID` in Step 3
   - **Client Secret** — click the eye icon to reveal it; copy it for `CLIENT_SECRET`
6. Under **OAuth 2.0 settings > Authorized redirect URLs for your app**, add a placeholder now:
   ```
   https://placeholder.example.com/auth/callback
   ```
   You will replace this with your real tunnel URL in Step 4. LinkedIn requires at least one URL to save the app.

   > **Important:** LinkedIn does **not** support wildcard redirect URIs. You must register the exact full URL (including the tunnel subdomain). If you use multiple environments, register each URL separately.

7. Open the **Products** tab. Request access to both:
   - **Sign In with LinkedIn using OpenID Connect** — grants `openid`, `profile`, `email` scopes
   - **Share on LinkedIn** — grants `w_member_social` scope (required for `postUpdate`)

   Approval for Share on LinkedIn may take a few minutes to a few hours. You will receive an email when approved. You cannot post updates until this is approved.

---

## Step 3: Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the following:

| Variable | Where to find it |
|---|---|
| `CLIENT_ID` | LinkedIn Developer Portal > Your App > Auth tab |
| `CLIENT_SECRET` | LinkedIn Developer Portal > Your App > Auth tab (click the eye icon) |
| `SESSION_SECRET` | Generate with the command below |
| `BASE_URL` | Your tunnel HTTPS URL — set this after Step 4 |
| `PORT` | Optional — defaults to `3000` |

Generate a secure `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as the value of `SESSION_SECRET` in your `.env` file.

Leave `BASE_URL` blank for now — you will fill it in after starting the tunnel in Step 4.

---

## Step 4: Set up a tunnel (expose localhost to the internet)

LinkedIn OAuth requires a publicly reachable HTTPS callback URL. You need a tunnel from the internet to your local `localhost:3000`.

> **Why this matters:** LinkedIn's redirect URI must be an exact match — no wildcards. If your tunnel URL changes (ngrok free tier), you must update the LinkedIn Developer Portal each time. Choose the option that fits your workflow.

### Option A — Cloudflare Tunnel (recommended — free, permanent subdomain)

Cloudflare Tunnel gives you a permanent subdomain that never changes on restart.

```bash
# Install once
npm install -g cloudflared    # or: brew install cloudflared

# Start tunnel (one command, no account required for trycloudflare.com)
cloudflared tunnel --url http://localhost:3000
```

The output will show a permanent URL like:
```
https://abc123.trycloudflare.com
```

This URL is stable across restarts. You only need to register it in LinkedIn once.

### Option B — ngrok with a static domain (paid plan)

If you already have an ngrok paid account with a static domain:

```bash
ngrok http --domain=your-static-domain.ngrok-free.app 3000
```

Your URL never changes. Register it in LinkedIn once.

### Option C — ngrok free tier (not recommended)

```bash
ngrok http 3000
```

ngrok free assigns a random subdomain on every restart (e.g. `abc123.ngrok-free.app`). Because LinkedIn does not support wildcard redirect URIs, **you must update the LinkedIn redirect URI every time you restart ngrok**. This gets tedious quickly. Use Option A or B unless you have a specific reason to use ngrok free.

---

## Step 4b: Register the redirect URI and update .env

Do this **before starting the server** — LinkedIn must recognise the redirect URI before any OAuth flow begins.

### 4b-1. Update your .env

Open `.env` and set:

```
BASE_URL=https://abc123.trycloudflare.com
```

Replace `abc123.trycloudflare.com` with your actual tunnel URL (whatever your tunnel tool printed).

### 4b-2. Register the redirect URI on LinkedIn

1. Go to [developer.linkedin.com](https://developer.linkedin.com) > Your App > **Auth** tab.
2. Under **OAuth 2.0 settings > Authorized redirect URLs for your app**, remove the placeholder and add:
   ```
   https://abc123.trycloudflare.com/auth/callback
   ```
   Replace the subdomain with your actual tunnel URL.
3. Click **Update** to save.

> If you are using Cloudflare Tunnel (Option A), you only need to do this once — the URL never changes.
> If you are using ngrok free (Option C), you must repeat Steps 4b-1 and 4b-2 every time you restart ngrok.

---

## Step 5: Start the server

```bash
npm run dev
```

You should see:

```
LinkedIn MCP Server running on http://localhost:3000
MCP endpoint: https://abc123.trycloudflare.com/mcp
```

Verify the server is healthy:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

Verify it is reachable through the tunnel:

```bash
curl https://abc123.trycloudflare.com/health
# Expected: {"status":"ok"}
```

---

## Step 6: Connect to ChatGPT

1. In ChatGPT, go to **Explore GPTs** > **Create** > open the **Configure** tab of your GPT.
2. Scroll to **Actions** and click **Add actions**.
3. Set up the connector with these settings:

   | Field | Value |
   |---|---|
   | **Authentication type** | OAuth |
   | **Client ID** | Your LinkedIn `CLIENT_ID` |
   | **Client Secret** | Your LinkedIn `CLIENT_SECRET` |
   | **Authorization URL** | `https://www.linkedin.com/oauth/v2/authorization` |
   | **Token URL** | `https://www.linkedin.com/oauth/v2/accessToken` |
   | **Scope** | `openid profile email w_member_social` |
   | **MCP endpoint** | `https://abc123.trycloudflare.com/mcp` |

   Replace `abc123.trycloudflare.com` with your actual tunnel URL.

4. Save the connector. ChatGPT will prompt you to sign in with LinkedIn on first use.
5. Test it: ask ChatGPT **"What is my LinkedIn headline?"** — it should call `getProfile` and return your name and headline.

---

## Troubleshooting

### Redirect URI mismatch

**Error:** LinkedIn returns `"The redirect_uri does not match the registered redirect_uri."`

**Cause:** The `BASE_URL` in your `.env` does not match the redirect URI registered on LinkedIn Developer Portal. This commonly happens when:
- You restarted ngrok free tier and got a new URL
- You set `BASE_URL` with a trailing slash (`https://abc123.trycloudflare.com/` instead of `https://abc123.trycloudflare.com`)
- The redirect URI on LinkedIn still points to the placeholder URL from Step 2

**Fix:**
1. Confirm your tunnel is running and note the current tunnel URL.
2. Update `BASE_URL` in `.env` to match exactly — no trailing slash.
3. Go to LinkedIn Developer Portal > Your App > Auth tab and update the authorized redirect URI to `https://<tunnel-url>/auth/callback`.
4. Click Update on LinkedIn, then restart the server (`npm run dev`).

---

### Missing LinkedIn scopes

**Error:** `postUpdate` returns a 403 or `"insufficient permissions"`.

**Cause:** The **Share on LinkedIn** product has not been approved for your LinkedIn App, or the `w_member_social` scope is missing.

**Fix:**
1. Go to LinkedIn Developer Portal > Your App > **Products** tab.
2. Confirm **Share on LinkedIn** shows status **Added** (not "Pending" or "Request access").
3. If it still shows "Request access", submit the request and wait for approval (typically under 24 hours).
4. Once approved, check the **Auth** tab — `w_member_social` should appear in the OAuth 2.0 scopes list.

---

### Tunnel URL rotation (ngrok free tier)

**Symptom:** OAuth callback fails after restarting ngrok, or ChatGPT connector stops working.

**Cause:** ngrok free tier assigns a new random subdomain every time it starts. Because LinkedIn requires an exact redirect URI match — no wildcards — the old URL is now invalid.

**Fix (each ngrok restart — applies to Option C only):**
1. Copy the new tunnel URL from the ngrok terminal.
2. Update `BASE_URL` in `.env`.
3. Update the authorized redirect URI in LinkedIn Developer Portal > Auth tab.
4. Click Update on LinkedIn.
5. Restart the server (`npm run dev`).
6. Update the MCP endpoint URL in your ChatGPT connector settings.

**Permanent fix:** Switch to Cloudflare Tunnel (Option A in Step 4) — free, permanent subdomain, no registration updates needed on restart.

---

## Architecture overview

```
ChatGPT
  |
  | JSON-RPC over HTTP (Streamable HTTP transport)
  v
LinkedIn MCP Server (localhost:3000, exposed via tunnel)
  |-- POST /mcp              MCP request dispatcher (tool calls, initialize, tools/list)
  |-- GET  /mcp              SSE stream for server-to-client events
  |-- GET  /.well-known/oauth-protected-resource  MCP discovery
  |-- GET  /auth/login       Starts LinkedIn OAuth flow
  |-- GET  /auth/callback    Exchanges code for tokens
  |-- GET  /auth/logout      Clears session
  |-- GET  /health           Health check
  |
  | LinkedIn API v2
  v
LinkedIn (api.linkedin.com)
```

---

## Available tools

| Tool | Description | Required scope |
|---|---|---|
| `getProfile` | Returns your name, email, headline, and LinkedIn person ID | `openid profile email` |
| `postUpdate` | Posts a text update to your LinkedIn feed (max 3000 chars) | `w_member_social` |

---

*Built by [OgeonX AI](https://ogeonx.ai)*

---

Write this content verbatim as README.md. Do not add extra sections. Do not omit sections. Replace the placeholder GitHub URL (`https://github.com/your-org/linkedin-mcp-server.git`) if the actual remote URL is known from the git config — otherwise leave the placeholder.
  </action>
  <verify>
    <automated>grep -c "cloudflared" README.md && grep -c "/mcp" README.md && grep -c "Troubleshooting" README.md && grep -c "redirect" README.md && grep -c "SESSION_SECRET" README.md</automated>
  </verify>
  <done>
- README.md exists at repo root
- MCP endpoint shown as `/mcp` (not `/sse`) in Step 6 connector table and architecture diagram
- Step 4 offers three tunnel options with Cloudflare Tunnel as Option A (recommended)
- Step 4b explicitly instructs developer to register the redirect URI BEFORE starting the server
- Warning about LinkedIn not supporting wildcard redirect URIs is present
- All three Troubleshooting scenarios present: redirect URI mismatch, missing scopes, tunnel URL rotation
- Architecture diagram shows POST /mcp and GET /mcp (Streamable HTTP transport)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
README.md (full developer onboarding guide with Cloudflare Tunnel as recommended option and /mcp endpoint), .env.example (complete and annotated), src/config.ts (updated with BASE_URL if it was missing).
  </what-built>
  <how-to-verify>
1. Open README.md in a Markdown viewer (GitHub preview or VS Code preview).
2. Read through it as if you have never seen this project. Verify:
   - All 6 steps are present and numbered (Step 4 has sub-steps 4 and 4b)
   - Step 4 shows three tunnel options with Cloudflare Tunnel as Option A (recommended)
   - The ChatGPT connector table in Step 6 shows MCP endpoint as `https://<tunnel-url>/mcp` (not /sse)
   - The architecture diagram shows `POST /mcp` and `GET /mcp`
   - Step 4b says to register the redirect URI BEFORE starting the server
   - The warning "LinkedIn does not support wildcard redirect URIs" is present in Step 2
   - All three Troubleshooting scenarios are present: redirect URI mismatch, missing scopes, tunnel URL rotation
3. Open `.env.example`. Confirm every variable has an inline or above-line comment.
4. Open `src/config.ts`. Confirm BASE_URL is parsed by the Zod schema.
5. Confirm no real credentials appear anywhere in README.md or .env.example.
  </how-to-verify>
  <resume-signal>Type "approved" if the docs are complete and correct, or describe any gaps or corrections needed.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer machine → README | Static documentation; no runtime trust boundary |
| .env.example → .env | Example file contains no real secrets; actual .env must never be committed |
| src/config.ts → process.env | Zod schema validates all env vars at startup — malformed or missing values fail fast rather than silently using undefined |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-01 | Information Disclosure | .env.example | accept | .env.example contains placeholder strings only — .env is gitignored (SEC-05, Phase 5). No real secret exposure risk. |
| T-06-02 | Information Disclosure | README.md | mitigate | README must not include any real CLIENT_ID, CLIENT_SECRET, or SESSION_SECRET values. All credential fields must use placeholder strings (e.g. `your_linkedin_client_id_here`). Executor must verify no real credentials appear in the committed README. |
| T-06-03 | Spoofing | Tunnel URL (redirect URI) | mitigate | README explicitly warns that LinkedIn does not support wildcard redirect URIs and instructs the developer to register the exact URL. Step 4b requires redirect URI registration before server start. Cloudflare Tunnel (permanent URL) is the recommended option, reducing the attack surface of stale/rotated tunnel URLs. |
| T-06-04 | Elevation of Privilege | ngrok free tier URL rotation | accept | README explicitly warns against ngrok free tier for this reason and provides Cloudflare Tunnel as the recommended alternative. If developer chooses ngrok free, they accept the operational burden of updating the redirect URI on every restart. |
</threat_model>

<verification>
After all tasks complete:

```bash
# 1. README exists and contains required sections
grep -c "Step 1" README.md
grep -c "Step 6" README.md
grep -c "Troubleshooting" README.md
grep -c "cloudflared" README.md

# 2. MCP endpoint is /mcp not /sse in README
grep "/mcp" README.md
# Must appear; grep -c "/sse" README.md must return 0 or only appear in comments

# 3. .env.example contains all required keys
grep -E "^(CLIENT_ID|CLIENT_SECRET|SESSION_SECRET|BASE_URL|PORT)" .env.example | wc -l
# Expected: 5

# 4. BASE_URL present in config.ts Zod schema
grep "BASE_URL" src/config.ts

# 5. No real secrets in .env.example
grep -E "^CLIENT_SECRET=[a-zA-Z0-9]{10,}" .env.example
# Expected: no output (value must be a placeholder string)
```
</verification>

<success_criteria>
- README.md is present at repo root with all 6 steps and a Troubleshooting section
- MCP endpoint in Step 6 connector config is `https://<tunnel-url>/mcp` (Streamable HTTP transport)
- Cloudflare Tunnel is documented as the recommended option (Option A) in Step 4
- LinkedIn wildcard redirect URI limitation is called out explicitly
- Step 4b instructs developer to register the redirect URI BEFORE starting the server
- A developer reading only the README can complete the full setup without external guidance
- .env.example documents CLIENT_ID, CLIENT_SECRET, SESSION_SECRET, BASE_URL, PORT — each with a comment
- src/config.ts parses BASE_URL via its Zod schema
- No real credentials appear in any committed file
- Human verification checkpoint passed
</success_criteria>

<output>
After completion, create `.planning/phases/phase-6/phase-6-01-SUMMARY.md` using the summary template at `@$HOME/.claude/get-shit-done/templates/summary.md`.

Include:
- Files modified: README.md, .env.example, src/config.ts
- What was done in each task
- Any deviations from the plan (e.g. BASE_URL was already present — no patch needed)
- Confirmation that human verification checkpoint was approved
</output>
