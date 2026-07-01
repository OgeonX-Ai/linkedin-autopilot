# Connecting OgeonX to ChatGPT

This guide walks through the complete setup: creating a Custom GPT, configuring
the OAuth action, and testing the connection. Estimated time: 15 minutes.

**Prerequisites:**
- ChatGPT Plus, Team, or Enterprise subscription (Custom GPTs require a paid plan)
- OgeonX server running and accessible at a public HTTPS URL
- LinkedIn developer app created at [linkedin.com/developers](https://www.linkedin.com/developers)

---

## Step 1: Create a Custom GPT

1. Go to [chatgpt.com](https://chatgpt.com) and click your profile → **My GPTs**.
2. Click **Create a GPT**.
3. Switch to the **Configure** tab (not the builder conversation).
4. Set a name: `LinkedIn Autopilot` (or any name you prefer).
5. Set the system prompt. A good starting prompt:

```
You are a LinkedIn content assistant connected to the user's LinkedIn account.

You can:
- Fetch their LinkedIn profile (getProfile)
- Post text updates (postUpdate)
- Post AI news automatically (postAINews)
- Post thought leadership content (postThoughtLeadership)
- Post a weekly AI roundup (postWeeklyRoundup)
- Share articles with rich previews (postArticle)
- Search for jobs (searchJobs)
- Read recent git commits to compose build-in-public posts (getRecentCommits)

When posting, always confirm the final post text with the user before calling postUpdate
unless the user says "just post it" or "post automatically".

Keep posts professional, specific, and under 1500 characters unless the user asks
for a longer post. End thought leadership posts with a question to drive engagement.
```

---

## Step 2: Add the LinkedIn action

1. In the **Configure** tab, scroll to **Actions** and click **Create new action**.
2. Click **Import from URL** and enter:
   ```
   https://<your-server-url>/mcp
   ```
   Or paste the schema manually. The server exposes its OpenAPI schema at
   `GET /mcp` (set `Accept: application/json` or use the well-known endpoint at
   `GET /.well-known/oauth-protected-resource`).

3. If importing from URL fails (some GPT builder versions do), you can use the
   OpenAPI 3.1 schema structure. The key endpoints are `POST /mcp` for tool calls
   and the OAuth endpoints listed in Step 3.

4. Under **Authentication**, select **OAuth** (not "API Key" or "None").

---

## Step 3: Configure OAuth

Fill in all four fields exactly as shown. Replace `<your-server-url>` with your
actual server URL (e.g., `https://ogeon.example.com`).

| Field | Value |
|-------|-------|
| **Client ID** | Your `LINKEDIN_CLIENT_ID` value from `.env` |
| **Client Secret** | Your `LINKEDIN_CLIENT_SECRET` value from `.env` |
| **Authorization URL** | `https://<your-server-url>/oauth/authorize` |
| **Token URL** | `https://<your-server-url>/oauth/token` |
| **Scope** | `openid profile email w_member_social` |
| **Token Exchange Method** | POST body (not Basic Auth header) |

**Save the action.** ChatGPT will display a **Callback URL** — copy it.

Go to your LinkedIn developer app → **Auth** → **Authorized redirect URLs for your app**
and add the ChatGPT callback URL. It looks like:
```
https://chatgpt.com/aip/g-<your-gpt-id>/oauth/callback
```

Also ensure your server's `SERVER_URL` is set and that `/oauth/callback` is also
listed as an authorized redirect URL in your LinkedIn app:
```
https://<your-server-url>/oauth/callback
```

---

## Step 4: Test the connection

1. **Save and publish** your Custom GPT (set it to "Only me" for testing).
2. Start a new conversation with your GPT.
3. Type: `What is my LinkedIn profile?`
4. ChatGPT will prompt you to sign in — click **Sign in** and complete the LinkedIn
   OAuth flow in the popup window.
5. After granting permissions, LinkedIn redirects back to ChatGPT.
6. ChatGPT calls `getProfile` and should return something like:

```
Name: Kim Harjamäki
Email: kim.harjamaki@prosimo.fi
Headline: Senior Software Engineer
LinkedIn ID: urn:li:person:abc123...
```

If you see the profile, the connection is working correctly.

---

## Step 5: Example prompts

Once connected, try these prompts to explore the tool suite:

### Post about what you're building

```
Look at my recent commits in /Users/me/projects/my-app and write a professional
LinkedIn post about what I've been building this week.
```

ChatGPT will call `getRecentCommits`, draft a post, ask for your approval,
then call `postUpdate`.

### Search for jobs

```
Search for senior DevOps jobs in Helsinki and show me the top 5 results.
Also check for remote DevOps roles on Remotive.
```

ChatGPT will call `searchJobs` twice and format the results.

### Post a thought leadership article

```
Write and post a thought leadership article about AI agents in Finnish companies.
Post it in Finnish. End with a question that gets comments.
```

ChatGPT will draft the article, confirm with you, then call `postUpdate` or
`postThoughtLeadership`.

### Post today's AI news

```
Post today's most important AI news to my LinkedIn. Use a professional tone
and add 3 relevant hashtags.
```

ChatGPT will call `postAINews` which fetches a live RSS headline and posts it.

### Share a blog post with rich preview

```
Share my latest blog post at https://myblog.com/ai-guide — write a short
commentary about why developers should read it.
```

ChatGPT will call `postArticle` with `sourceUrl` set, generating a native
LinkedIn article card with rich preview.

### Weekly roundup

```
Post this week's AI news roundup to LinkedIn. Make it save-worthy — use
a numbered list format and end with "Save this post for reference".
```

ChatGPT will call `postWeeklyRoundup`.

---

## Troubleshooting

### `invalid_state` error during OAuth

**Cause:** The `state` parameter generated during `/oauth/authorize` did not match
what LinkedIn returned in the callback. This usually happens when:
- The server restarted between the authorize and callback steps (losing the
  in-memory `pendingAuthRequests` map)
- The callback URL in the LinkedIn app settings does not exactly match the URL
  the server uses (including trailing slashes)

**Fix:**
1. Confirm `SERVER_URL` in `.env` exactly matches the URL in your LinkedIn app's
   authorized redirect URLs (no trailing slash, correct protocol).
2. Retry — click the ChatGPT "Sign in" link again to start a fresh OAuth flow.
3. If the error persists after a server restart, the session was lost. Retry.

### Token expired / "Not authenticated"

**Cause:** The 1-hour JWT issued to ChatGPT has expired, or the LinkedIn access token
in the session has expired (typically 60 days for LinkedIn tokens).

**Fix:** Start a new conversation with your GPT. ChatGPT will detect the expired token
and prompt you to re-authenticate automatically.

If re-authentication fails, the LinkedIn access token may have been revoked. Go to
[linkedin.com/mypreferences/d/categories/privacy](https://www.linkedin.com/mypreferences/d/categories/privacy)
→ Data privacy → Third-party apps → revoke and re-grant access.

### "Permission denied — check your LinkedIn app scopes" (403)

**Cause:** Your LinkedIn developer app does not have `w_member_social` permission,
or the permission was added after the user last authenticated (old token lacks the scope).

**Fix:**
1. Go to your LinkedIn developer app → **Products** → request the
   **Share on LinkedIn** product (this grants `w_member_social`).
2. After LinkedIn approves the product (usually instant for personal apps),
   re-authenticate in ChatGPT to get a new token with the updated scopes.

### ChatGPT says "I couldn't connect to LinkedIn" with no OAuth prompt

**Cause:** The action URL is unreachable, or the action schema has a configuration error.

**Fix:**
1. Verify the server is running: `curl https://<your-server-url>/health` should
   return `{"status":"ok"}`.
2. Check the tunnel is active (Cloudflare tunnel, ngrok, etc.).
3. Open the GPT action editor and click **Test** to see the raw error response.

### Tool calls succeed but no post appears on LinkedIn

**Cause:** The post was created successfully (LinkedIn returned a post ID) but may be
held for review under LinkedIn's spam prevention, or was posted to a visibility setting
other than PUBLIC.

**Fix:** All posts created by this server use `"visibility": "PUBLIC"` and
`"lifecycleState": "PUBLISHED"`. Check your LinkedIn profile directly — the post
may appear after a short delay (up to 5 minutes in rare cases). If it never appears,
check the LinkedIn app's usage metrics in the developer portal for API errors.
