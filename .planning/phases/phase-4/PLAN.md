---
phase: 04-linkedin-tools
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/linkedin/client.ts
  - src/tools/get-profile.ts
  - src/tools/post-update.ts
  - src/mcp/tool-registry.ts
  - src/mcp/server.ts
autonomous: true
requirements: [TOOLS-01, TOOLS-02, TOOLS-03, TOOLS-04, TOOLS-05]

must_haves:
  truths:
    - "getProfile returns name, email, headline, and sub from LinkedIn /v2/userinfo"
    - "postUpdate creates a LinkedIn post and returns a post ID and URL"
    - "Both tools expose valid JSON Schema inputSchema"
    - "Empty string or >3000 char text to postUpdate returns a validation error before any API call"
    - "LinkedIn API errors (401, 403, 429, 5xx) surface as readable English text in the MCP result — no stack traces"
  artifacts:
    - path: "src/linkedin/client.ts"
      provides: "LinkedInClient class with getProfile and createPost methods plus error mapper"
      exports: ["LinkedInClient", "LinkedInApiError"]
    - path: "src/tools/get-profile.ts"
      provides: "MCP tool handler for getProfile"
      exports: ["getProfileHandler", "getProfileSchema"]
    - path: "src/tools/post-update.ts"
      provides: "MCP tool handler for postUpdate with text validation"
      exports: ["postUpdateHandler", "postUpdateSchema"]
    - path: "src/mcp/tool-registry.ts"
      provides: "Tool registration wiring both handlers into the MCP server"
      exports: ["registerTools"]
    - path: "src/mcp/server.ts"
      provides: "MCP server with real tool dispatch replacing stubs"
  key_links:
    - from: "src/tools/post-update.ts"
      to: "src/linkedin/client.ts"
      via: "LinkedInClient.createPost call"
    - from: "src/tools/get-profile.ts"
      to: "src/linkedin/client.ts"
      via: "LinkedInClient.getProfile call"
    - from: "src/mcp/tool-registry.ts"
      to: "src/tools/get-profile.ts and src/tools/post-update.ts"
      via: "registerTools imports and wires both handlers"
    - from: "src/mcp/server.ts"
      to: "src/mcp/tool-registry.ts"
      via: "registerTools(server) call at startup"
---

<objective>
Implement the two LinkedIn MCP tools — getProfile and postUpdate — end to end: LinkedIn API client, tool handlers, JSON Schema inputSchema, tool registration, and real dispatch in the MCP server. After this plan the authenticated ChatGPT user can fetch their LinkedIn profile or post a text update using natural language.

Purpose: Deliver the core user-facing value of the project — LinkedIn read/write from ChatGPT.
Output: Five source files; the MCP server dispatches real LinkedIn API calls and returns structured results or readable error messages.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/OgeonX-AI/.planning/PROJECT.md
@C:/OgeonX-AI/.planning/ROADMAP.md
@C:/OgeonX-AI/.planning/REQUIREMENTS.md

<!-- Phase 3 established: session stores accessToken, refreshToken, sub (LinkedIn person ID).
     Tool handlers can read req.session.accessToken and req.session.sub.
     The MCP server currently has stub tool handlers returning placeholder results.
     No LinkedIn API client exists yet — create it from scratch. -->
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LinkedIn API client — src/linkedin/client.ts</name>
  <files>src/linkedin/client.ts, src/linkedin/client.test.ts</files>
  <behavior>
    - getProfile(accessToken): calls GET https://api.linkedin.com/v2/userinfo, returns { name, email, headline, sub }
    - createPost(accessToken, authorUrn, text): calls POST https://api.linkedin.com/v2/ugcPosts with UGC body, returns { postId, postUrl }
    - 401 from LinkedIn → throws LinkedInApiError with message "Not authenticated. Please reconnect your LinkedIn account."
    - 403 from LinkedIn → throws LinkedInApiError with message "Permission denied. Check your LinkedIn app scopes."
    - 429 from LinkedIn → throws LinkedInApiError with message "LinkedIn rate limit exceeded. Please wait a moment and try again."
    - 5xx from LinkedIn → throws LinkedInApiError with message "LinkedIn service error (HTTP {status}). Try again later."
    - Network / fetch failure → throws LinkedInApiError with message "Could not reach LinkedIn. Check your internet connection."
    - createPost 201 response: post ID extracted from X-RestLi-Id response header (the URN string); postUrl constructed as https://www.linkedin.com/feed/update/{postId}/
    - getProfile maps response fields: sub → sub, name → name, email → email, headline field name in userinfo response is "headline" (may be absent → use empty string)
  </behavior>
  <action>
Create src/linkedin/client.ts:

```typescript
import fetch from "node-fetch"; // or native fetch if Node 18+; check package.json engines

export class LinkedInApiError extends Error {
  constructor(public readonly httpStatus: number | null, message: string) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

const LINKEDIN_VERSION = "202304";

const LINKEDIN_ERROR_MESSAGES: Record<number, string> = {
  401: "Not authenticated. Please reconnect your LinkedIn account.",
  403: "Permission denied. Check your LinkedIn app scopes.",
  429: "LinkedIn rate limit exceeded. Please wait a moment and try again.",
};

function mapLinkedInError(status: number): string {
  if (LINKEDIN_ERROR_MESSAGES[status]) return LINKEDIN_ERROR_MESSAGES[status];
  if (status >= 500) return `LinkedIn service error (HTTP ${status}). Try again later.`;
  return `Unexpected LinkedIn API error (HTTP ${status}).`;
}

export interface LinkedInProfile {
  sub: string;
  name: string;
  email: string;
  headline: string;
}

export interface LinkedInPost {
  postId: string;
  postUrl: string;
}

export class LinkedInClient {
  private async request(url: string, options: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      throw new LinkedInApiError(null, "Could not reach LinkedIn. Check your internet connection.");
    }
    if (!response.ok) {
      throw new LinkedInApiError(response.status, mapLinkedInError(response.status));
    }
    return response;
  }

  async getProfile(accessToken: string): Promise<LinkedInProfile> {
    const response = await this.request("https://api.linkedin.com/v2/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LINKEDIN_VERSION,
      },
    });
    const data = await response.json() as Record<string, unknown>;
    return {
      sub: String(data["sub"] ?? ""),
      name: String(data["name"] ?? ""),
      email: String(data["email"] ?? ""),
      headline: String(data["headline"] ?? ""),
    };
  }

  async createPost(accessToken: string, authorUrn: string, text: string): Promise<LinkedInPost> {
    const body = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const response = await this.request("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LINKEDIN_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // LinkedIn returns 201 with X-RestLi-Id containing the post URN
    const postId = response.headers.get("X-RestLi-Id") ?? "";
    const postUrl = `https://www.linkedin.com/feed/update/${postId}/`;
    return { postId, postUrl };
  }
}
```

Create src/linkedin/client.test.ts using the project's test framework (check package.json for jest/vitest). Mock the fetch function. Cover all error branches listed in the behavior block. Do NOT make real HTTP calls in tests — use jest.fn() or vi.fn() stubs.

Test structure (jest example):
- describe("LinkedInClient.getProfile") → test happy path (200 + JSON), test 401, 403, 429, 503, network error
- describe("LinkedInClient.createPost") → test happy path (201 + X-RestLi-Id header), test 401, 429, network error

For the happy-path createPost test: stub fetch to return status 201 with headers `{ "X-RestLi-Id": "urn:li:share:123" }` and verify returned postId = "urn:li:share:123" and postUrl = "https://www.linkedin.com/feed/update/urn:li:share:123/".
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit && npm test -- --testPathPattern=client</automated>
  </verify>
  <done>TypeScript compiles with no errors. All client unit tests pass. No real HTTP calls made in tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Tool handlers — src/tools/get-profile.ts and src/tools/post-update.ts</name>
  <files>src/tools/get-profile.ts, src/tools/post-update.ts, src/tools/get-profile.test.ts, src/tools/post-update.test.ts</files>
  <behavior>
    getProfileHandler:
    - Reads accessToken from session; if missing, returns isError:true with "Not authenticated. Visit /auth/login to connect LinkedIn."
    - Calls LinkedInClient.getProfile(accessToken)
    - On success: returns CallToolResult with isError:false and content [{ type:"text", text: formatted profile string }]
    - Format: "Name: {name}\nEmail: {email}\nHeadline: {headline}\nLinkedIn ID: {sub}"
    - On LinkedInApiError: returns isError:true, content [{ type:"text", text: error.message }] — no stack trace

    postUpdateHandler:
    - Reads accessToken and sub from session; if missing, returns isError:true "Not authenticated. Visit /auth/login to connect LinkedIn."
    - Validates text: if empty → isError:true "Post text cannot be empty."
    - Validates text: if length > 3000 → isError:true "Post text exceeds LinkedIn's 3000-character limit ({actual} characters)."
    - Validation errors return BEFORE any API call (LinkedInClient must not be called)
    - On success: returns isError:false, content [{ type:"text", text: "Post created successfully.\nPost ID: {postId}\nURL: {postUrl}" }]
    - On LinkedInApiError: returns isError:true, content [{ type:"text", text: error.message }]

    inputSchema for getProfile:
    {
      type: "object",
      properties: {},
      required: []
    }

    inputSchema for postUpdate:
    {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text content of the LinkedIn post (max 3000 characters)"
        }
      },
      required: ["text"]
    }
  </behavior>
  <action>
Create src/tools/get-profile.ts:

```typescript
import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";

export const getProfileSchema = {
  type: "object" as const,
  properties: {},
  required: [] as string[],
};

export async function getProfileHandler(
  _args: Record<string, unknown>,
  session: { accessToken?: string }
) {
  if (!session.accessToken) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "Not authenticated. Visit /auth/login to connect LinkedIn." }],
    };
  }

  const client = new LinkedInClient();
  try {
    const profile = await client.getProfile(session.accessToken);
    const text = [
      `Name: ${profile.name}`,
      `Email: ${profile.email}`,
      `Headline: ${profile.headline}`,
      `LinkedIn ID: ${profile.sub}`,
    ].join("\n");
    return {
      isError: false,
      content: [{ type: "text" as const, text }],
    };
  } catch (err) {
    const message = err instanceof LinkedInApiError
      ? err.message
      : "An unexpected error occurred.";
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}
```

Create src/tools/post-update.ts:

```typescript
import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";

export const postUpdateSchema = {
  type: "object" as const,
  properties: {
    text: {
      type: "string" as const,
      description: "The text content of the LinkedIn post (max 3000 characters)",
    },
  },
  required: ["text"] as string[],
};

export async function postUpdateHandler(
  args: { text?: string },
  session: { accessToken?: string; sub?: string }
) {
  if (!session.accessToken || !session.sub) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "Not authenticated. Visit /auth/login to connect LinkedIn." }],
    };
  }

  const text = args.text ?? "";

  if (text.length === 0) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "Post text cannot be empty." }],
    };
  }

  if (text.length > 3000) {
    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: `Post text exceeds LinkedIn's 3000-character limit (${text.length} characters).`,
      }],
    };
  }

  const authorUrn = `urn:li:person:${session.sub}`;
  const client = new LinkedInClient();

  try {
    const post = await client.createPost(session.accessToken, authorUrn, text);
    return {
      isError: false,
      content: [{
        type: "text" as const,
        text: `Post created successfully.\nPost ID: ${post.postId}\nURL: ${post.postUrl}`,
      }],
    };
  } catch (err) {
    const message = err instanceof LinkedInApiError
      ? err.message
      : "An unexpected error occurred.";
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}
```

Create test files for both handlers. Mock LinkedInClient (jest.mock or vi.mock). Cover:
- get-profile.test.ts: no session → isError:true auth message; success → formatted profile text; LinkedInApiError → isError:true with error message
- post-update.test.ts: no session → isError:true auth; empty text → validation error (createPost NOT called); 3001-char text → validation error (createPost NOT called); 3000-char text → succeeds (exactly at limit); LinkedInApiError → isError:true with error message; success → post ID + URL in content text
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit && npm test -- --testPathPattern="get-profile|post-update"</automated>
  </verify>
  <done>TypeScript compiles. All handler tests pass including validation boundary tests (0 chars, 3000 chars, 3001 chars). LinkedInClient is never called when validation fails.</done>
</task>

<task type="auto">
  <name>Task 3: Tool registry and server wiring — src/mcp/tool-registry.ts and src/mcp/server.ts</name>
  <files>src/mcp/tool-registry.ts, src/mcp/server.ts</files>
  <action>
Read src/mcp/server.ts first to understand the existing stub structure, session shape, and how tool dispatch is currently wired. Then:

**src/mcp/tool-registry.ts** — create this file:

```typescript
import { getProfileHandler, getProfileSchema } from "../tools/get-profile.js";
import { postUpdateHandler, postUpdateSchema } from "../tools/post-update.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>, session: Record<string, unknown>) => Promise<unknown>;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: "getProfile",
    description: "Fetch the authenticated user's LinkedIn profile (name, email, headline, LinkedIn ID).",
    inputSchema: getProfileSchema,
    handler: (args, session) => getProfileHandler(args, session as { accessToken?: string }),
  },
  {
    name: "postUpdate",
    description: "Post a text update to the authenticated user's LinkedIn feed.",
    inputSchema: postUpdateSchema,
    handler: (args, session) =>
      postUpdateHandler(
        args as { text?: string },
        session as { accessToken?: string; sub?: string }
      ),
  },
];

export function getToolList() {
  return TOOL_REGISTRY.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  session: Record<string, unknown>
) {
  const tool = TOOL_REGISTRY.find((t) => t.name === toolName);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
    };
  }
  return tool.handler(args, session);
}
```

**src/mcp/server.ts** — replace stub tool handling:

Read the file first. Locate the `tools/list` handler and replace its return value with `getToolList()` from tool-registry. Locate the `tools/call` handler (currently returning a stub/placeholder) and replace it with a call to `dispatchTool(params.name, params.arguments ?? {}, req.session)`.

Import `getToolList` and `dispatchTool` from `../mcp/tool-registry.js` at the top of server.ts.

Do NOT change any other logic in server.ts (SSE transport, auth middleware, health endpoint, origin validation). Only swap out the stub tool list and stub tool dispatch.

Preserve the existing session access pattern — if the server uses `req.session`, pass `req.session` directly to `dispatchTool`. If session is typed, cast to `Record<string, unknown>`.
  </action>
  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>TypeScript compiles with no errors. Build succeeds. tool-registry.ts exports getToolList and dispatchTool. server.ts imports and uses them — no stub strings remain in the tools/list or tools/call handlers.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tool args → handler | ChatGPT (or any MCP client) supplies tool arguments; treated as untrusted input |
| Handler → LinkedIn API | Access token from session is forwarded to LinkedIn; must not be logged |
| LinkedIn API → handler | HTTP responses from LinkedIn are external; errors must be sanitised before reaching user |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | postUpdateHandler args.text | mitigate | Validate non-empty and ≤3000 chars before any API call; args are not trusted |
| T-04-02 | Information Disclosure | LinkedInApiError | mitigate | Error messages use static strings only; never include raw response bodies, tokens, or stack traces |
| T-04-03 | Denial of Service | postUpdate text length | mitigate | 3000-char cap enforced in handler before API call; prevents oversized upstream requests |
| T-04-04 | Elevation of Privilege | session.sub used as author URN | mitigate | Sub is read from server-side session (set by Phase 3 auth flow), not from client-supplied args; user cannot post as another person |
| T-04-05 | Information Disclosure | LinkedIn access token in logs | accept | Token is passed in Authorization header only; no logging of headers in LinkedIn client; Phase 5 will harden log scrubbing |
</threat_model>

<verification>
After all tasks complete, run the full suite and type-check:

```bash
cd C:/OgeonX-AI && npm test && npx tsc --noEmit && npm run build
```

Manual smoke test (requires Phase 3 auth to be working):
1. Start server: `npm run dev`
2. Authenticate: visit `http://localhost:3000/auth/login`, complete LinkedIn OAuth
3. Send getProfile tool call via MCP client or curl — expect name/email/headline/sub in response
4. Send postUpdate tool call with text "Test post from MCP" — expect post ID and URL in response; verify post appears on LinkedIn
5. Send postUpdate with empty text — expect validation error, no API call
6. Send postUpdate with 3001-char text — expect character-count error, no API call
</verification>

<success_criteria>
1. `npm test` passes — all unit tests for LinkedInClient, getProfileHandler, postUpdateHandler green
2. `npx tsc --noEmit` exits 0 — no TypeScript errors across all new and modified files
3. `npm run build` exits 0 — compiled output in dist/ is complete
4. getProfile tool: inputSchema has type "object", properties {}, required []
5. postUpdate tool: inputSchema has type "object", properties.text with type "string", required ["text"]
6. postUpdate with "" → isError:true, message "Post text cannot be empty." (no LinkedIn API call)
7. postUpdate with 3001-char string → isError:true, message includes "3000-character limit" and actual count (no LinkedIn API call)
8. postUpdate with exactly 3000-char string → succeeds (API call made)
9. LinkedInApiError with status 401 → readable English message, no stack trace in MCP result
10. TOOL_REGISTRY in tool-registry.ts contains exactly two entries: "getProfile" and "postUpdate"
</success_criteria>

<output>
After completing all tasks and verification, create `.planning/phases/phase-4/phase-4-01-SUMMARY.md` with:
- What was built (files created/modified)
- Key decisions made during implementation (e.g., how session fields are accessed, fetch library used)
- Any deviations from this plan and why
- Patterns established for future tool additions
</output>
