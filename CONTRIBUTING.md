# Contributing to OgeonX LinkedIn Autopilot

Thank you for taking the time to contribute. This document covers everything you need
to get a working development environment, understand the codebase, add new tools, and
ship a change that will pass review.

---

## Development setup

**Prerequisites:** Node.js 20+, npm 10+, a LinkedIn developer application.

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env
# Fill in LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, SESSION_SECRET, SERVER_URL

# 3. Start the dev server with hot-reload
npm run dev
```

The server starts on `http://localhost:3000` by default. Set `PORT` in `.env` to change it.

For local OAuth testing you need a publicly reachable URL. Use a Cloudflare tunnel or
`ngrok` and set `SERVER_URL` to the tunnel URL, then update
`LINKEDIN_REDIRECT_URI` to `<SERVER_URL>/oauth/callback` in both `.env` and your
LinkedIn app settings.

---

## Project structure

```
src/
  auth/
    cookie.ts          HMAC-signed HttpOnly session cookie (read/write helpers)
    jwt.ts             Sign and verify JWTs for MCP and routine authentication
    linkedin.ts        LinkedIn OAuth token exchange + state generation
    session.ts         In-memory session store + SessionData type
    session-persist.ts Load/save session store to .sessions.json on disk
    user-registry.ts   Multi-user registry backed by .users.json

  linkedin/
    client.ts          LinkedInClient class + linkedinFetch() enforced wrapper
                       All LinkedIn API calls go through this file only

  mcp/
    server.ts          buildMcpServer() — registers all tools with Zod schemas

  middleware/
    auth-challenge.ts  Annotates 401 responses with WWW-Authenticate header
    origin.ts          Origin guard — blocks cross-origin requests
    require-auth.ts    JWT Bearer auth middleware for /mcp and /routine routes
    sanitize-errors.ts Global error handler — redacts secrets from error messages

  routes/
    admin.ts           Admin dashboard (protected by ADMIN_SECRET)
    auth.ts            Browser-based LinkedIn login (/auth/login, /auth/callback)
    landing.ts         Public landing page at /
    mcp.ts             MCP Streamable HTTP endpoints (GET + POST /mcp)
    oauth.ts           OAuth AS for ChatGPT (/oauth/authorize, /oauth/token)
    routine.ts         Scheduled routine endpoints (/routine/post-*, /routine/token)
    well-known.ts      OAuth Protected Resource discovery metadata

  tools/
    get-profile.ts         Fetch the authenticated user's LinkedIn profile
    get-recent-commits.ts  Read recent git commits via spawnSync (no shell)
    post-ai-news.ts        Fetch RSS feed + post AI news item to LinkedIn
    post-article.ts        Post a long-form article with optional rich link preview
    post-thought-leadership.ts  Opinion-style post with closing question
    post-update.ts         Post plain text update to LinkedIn
    post-weekly-roundup.ts Curate top 5 AI stories into a Friday roundup post
    search-jobs.ts         Search Remotive.io + Indeed for job listings

  config.ts   Validated environment config — exits on missing required vars
  index.ts    Application entry point — middleware order, route mounting, sessions
```

---

## How to add a new tool

Follow these five steps exactly. Skipping any step will cause the PR to be rejected.

### Step 1 — Create the handler in `src/tools/`

Create `src/tools/my-new-tool.ts`. The handler signature is always:

```typescript
export async function myNewToolHandler(
  args: { /* typed args */ },
  session: { accessToken?: string; linkedinSub?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated. Visit /oauth/authorize to connect LinkedIn." }],
    };
  }
  // ... implementation
}
```

Rules for the handler body:
- Use `linkedinFetch()` (from `src/linkedin/client.ts`) for every LinkedIn API call —
  never call `fetch()` directly with a LinkedIn URL.
- Catch errors and return `{ isError: true, content: [{ type: "text", text: sanitizedMessage }] }`.
  Never propagate raw error objects or stack traces to the caller.
- Static error strings only. No template literals that embed token values or raw API responses.

### Step 2 — Register the tool in `src/mcp/server.ts`

Inside `buildMcpServer()`, add:

```typescript
server.tool(
  "myNewTool",                       // camelCase tool name
  "One-line description for ChatGPT", // shown in ChatGPT action list
  {
    myParam: z.string().describe("What this parameter does"),
  },
  async ({ myParam }) => {
    const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
    const sessionArg = {
      ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
      ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
    };
    return myNewToolHandler({ myParam }, sessionArg);
  },
);
```

Always pull the session from `sessionStore` at call time — never cache it at build time.

### Step 3 — Add a routine endpoint in `src/routes/routine.ts` (if schedulable)

If your tool makes sense as a scheduled action, add:

```typescript
routineRoutes.post("/my-new-routine", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const claims = verifyJwt(authHeader.slice(7));
  if (!claims) return c.json({ error: "Invalid or expired token" }, 401);
  const session = sessionStore.get(claims.sub);
  if (!session?.accessToken || !session.linkedinSub) return c.json({ error: "No active session" }, 401);
  const result = await myNewToolHandler({}, { accessToken: session.accessToken, linkedinSub: session.linkedinSub });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});
```

### Step 4 — Export from index if needed

If external code needs to import your handler directly, re-export it from `src/index.ts`.
Most tools do not need this — skip it unless there is a clear requirement.

### Step 5 — Write a test

See Step 5 below for testing conventions.

---

## Code style rules

These rules are enforced in code review and cannot be bypassed.

| Rule | Correct | Wrong |
|------|---------|-------|
| No type hacks | `result as LinkedInProfile` with proper type assertion | `result as never` or double-cast |
| Shell safety | `spawnSync("git", ["log", ...args])` | `execSync(\`git log ${userInput}\`)` |
| LinkedIn API | `linkedinFetch(url, accessToken, options)` | `fetch(url, { headers: { Authorization: ... } })` |
| Error messages | Static strings: `"Not authenticated."` | Template literals: `` `Token ${token} rejected` `` |
| Secrets in logs | `console.error("[oauth] callback failed:", code)` | `console.error("Error:", err.message)` if message contains token |
| Import style | `.js` extensions on all local imports | `.ts` extension or no extension |

---

## Testing

The project uses [Vitest](https://vitest.dev/).

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Type-check without emitting output
npm run typecheck
```

### Writing a new test

Use `src/tools/get-profile.test.ts` as the reference pattern:

1. Mock `../linkedin/client.js` with `vi.mock()` — always re-export `LinkedInApiError` and
   `LinkedInClient` from the mock factory so the handler can `instanceof`-check errors.
2. Call `vi.clearAllMocks()` in `beforeEach`.
3. Always test three paths: success, `LinkedInApiError`, and unexpected error.
4. Assert that unexpected errors return `"An unexpected error occurred."` and do NOT
   contain a stack trace substring (e.g., `expect(text).not.toContain(" at ")`).

```typescript
// src/tools/my-new-tool.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { myNewToolHandler } from "./my-new-tool.js";

const mockLinkedInMethod = vi.fn();

vi.mock("../linkedin/client.js", () => {
  class LinkedInApiError extends Error {
    httpStatus: number | null;
    constructor(httpStatus: number | null, message: string) {
      super(message);
      this.name = "LinkedInApiError";
      this.httpStatus = httpStatus;
    }
  }
  class LinkedInClient {
    myLinkedInMethod = mockLinkedInMethod;
  }
  return { LinkedInClient, LinkedInApiError };
});

describe("myNewToolHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns auth error when no accessToken", async () => {
    const result = await myNewToolHandler({}, {});
    expect(result.isError).toBe(true);
  });

  it("returns success result", async () => {
    mockLinkedInMethod.mockResolvedValueOnce({ /* ... */ });
    const result = await myNewToolHandler({}, { accessToken: "tok" });
    expect(result.isError).toBe(false);
  });

  it("returns generic message on unexpected error", async () => {
    mockLinkedInMethod.mockRejectedValueOnce(new Error("boom"));
    const result = await myNewToolHandler({}, { accessToken: "tok" });
    expect(result.content[0]!.text).toBe("An unexpected error occurred.");
    expect(result.content[0]!.text).not.toContain(" at ");
  });
});
```

---

## PR checklist

Before opening a pull request, verify every item:

- [ ] `npm run build` exits with code 0
- [ ] `npm test` exits with code 0
- [ ] `npm run typecheck` exits with code 0
- [ ] No secrets, tokens, or credentials appear in source code or test fixtures
- [ ] Error messages returned by handlers use static strings — no raw API responses embedded
- [ ] New LinkedIn API calls go through `linkedinFetch()`, not raw `fetch()`
- [ ] Shell commands use `spawnSync` with an argument array, not `execSync` with template literals
- [ ] A test file exists for each new tool handler (three paths minimum)
- [ ] `CHANGELOG.md` updated if this is a user-visible change (new tool, behavior change)

---

## Commit message convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <short description>

[optional body]
```

| Type | When |
|------|------|
| `feat` | New tool, endpoint, or user-visible feature |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `refactor` | Code restructuring with no behavior change |
| `test` | Adding or updating tests |
| `chore` | Tooling, config, dependency updates |
| `perf` | Performance improvement with no behavior change |

Examples:

```
feat(tools): add postPoll tool for LinkedIn poll posts
fix(oauth): handle missing redirect_uri with 400 instead of 500
docs(contributing): add step-by-step guide for new tools
test(tools): add coverage for postArticle error paths
```

Scope is optional but recommended. Use the directory or module name (e.g., `tools`,
`oauth`, `middleware`, `linkedin`).
