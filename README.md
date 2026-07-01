# LinkedIn MCP Server

An MCP (Model Context Protocol) server that connects ChatGPT to LinkedIn. Users can fetch their LinkedIn profile and post updates directly from ChatGPT.

**Stack:** TypeScript · Node.js · Hono · MCP 2025-06-18 · LinkedIn v2 API

---

## Prerequisites

- Node.js 20+
- A [LinkedIn Developer account](https://developer.linkedin.com)
- A tunnel tool (Cloudflare Tunnel recommended — free permanent subdomain)

---

## Step 1: Clone and install

```bash
git clone <repo-url> linkedin-mcp
cd linkedin-mcp
npm install
```

---

## Step 2: Create a LinkedIn App

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/apps)
2. Click **Create app**
3. Fill in App Name, LinkedIn Page (create one if needed), and upload a logo
4. Under **Products**, request access to:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**
5. Go to **Auth** tab → note your **Client ID** and **Client Secret**
6. Under **OAuth 2.0 settings → Authorized redirect URLs**, add your tunnel URL (Step 4)

> ⚠️ LinkedIn requires exact redirect URI matching — no trailing slashes, must be HTTPS.

---

## Step 3: Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=<generate below>
LINKEDIN_REDIRECT_URI=https://your-tunnel-url/auth/callback
PORT=3000
ALLOWED_ORIGINS=https://chat.openai.com,https://chatgpt.com
SERVER_URL=https://your-tunnel-url
```

Generate a secure SESSION_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 4: Set up a tunnel

You need a public HTTPS URL so LinkedIn can redirect back to your local server.

**Option A — Cloudflare Tunnel (Recommended: free, permanent subdomain)**
```bash
# Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000
```
Copy the `trycloudflare.com` URL — it stays the same across restarts.

**Option B — ngrok (paid static domain)**
```bash
ngrok http --domain=your-static-domain.ngrok-free.app 3000
```

**Option C — ngrok free (not recommended)**
```bash
ngrok http 3000
```
⚠️ Free ngrok randomizes the subdomain on every restart. You must update the LinkedIn redirect URI and your `.env` each time.

**After getting your tunnel URL:**
1. Update `LINKEDIN_REDIRECT_URI`, `SERVER_URL` in `.env` to use the tunnel URL
2. Add `https://your-tunnel-url/auth/callback` as an authorized redirect URI in your LinkedIn app (Step 2 → Auth tab)

> ⚠️ Register the redirect URI in LinkedIn **before** starting the server — LinkedIn validates it at auth time.

---

## Step 5: Start the server

```bash
npm run dev
```

Verify it's running:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## Step 6: Connect to ChatGPT

1. Open [ChatGPT](https://chat.openai.com)
2. Go to **Settings → Connectors** (or the Apps/Plugins section)
3. Add a new connector with:
   - **MCP Endpoint:** `https://your-tunnel-url/mcp`
   - **Auth type:** OAuth 2.0
4. ChatGPT will discover the OAuth server via `/.well-known/oauth-protected-resource`
5. On first use, you'll be redirected to LinkedIn to authorize the app

---

## Available Tools

| Tool | Description |
|------|-------------|
| `getProfile` | Returns your LinkedIn name, email, and headline |
| `postUpdate` | Posts a text update to your LinkedIn feed (1–3000 characters) |

---

## Development

```bash
npm run dev        # Start with hot reload (tsx watch)
npm run build      # Compile to dist/
npm run typecheck  # TypeScript type check only
npm test           # Run all tests
```

---

## Troubleshooting

**"redirect_uri_mismatch" from LinkedIn**
The redirect URI in your `.env` doesn't exactly match what's registered in LinkedIn Developer Portal. Check for:
- Trailing slashes (LinkedIn is exact-match)
- HTTP vs HTTPS
- The path must be `/auth/callback`

**"Invalid scope" / 401 on login**
Your LinkedIn app doesn't have the required products approved. Ensure both **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** are approved under Products.

**Tunnel URL changed (ngrok free)**
Update `LINKEDIN_REDIRECT_URI` and `SERVER_URL` in `.env`, then update the redirect URI in LinkedIn Developer Portal, then restart the server.

**"Not authenticated" error in ChatGPT**
Visit `https://your-tunnel-url/auth/login` directly in your browser to initiate the LinkedIn OAuth flow. After approving, return to ChatGPT.

**ChatGPT can't connect to MCP server**
- Confirm the tunnel is running and `https://your-tunnel-url/health` returns `{"status":"ok"}`
- Confirm the MCP endpoint is `/mcp` (not `/sse`)
- Check `ALLOWED_ORIGINS` in `.env` includes `https://chat.openai.com` and `https://chatgpt.com`
