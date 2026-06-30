# Feature Landscape: LinkedIn MCP Server

**Domain:** LinkedIn integration via MCP tools for ChatGPT
**Researched:** 2026-06-30
**Approved LinkedIn products:** Sign In with LinkedIn (OIDC), Share on LinkedIn, Events Management API

---

## Scope Constraint: What the Approved Products Actually Allow

Before the feature list, it is critical to understand the hard boundary.

| LinkedIn Product | Scopes Granted | What It Enables |
|-----------------|----------------|-----------------|
| Sign In with LinkedIn (OIDC) | `openid`, `profile`, `email` | `/v2/userinfo` — sub, name, given_name, family_name, picture, locale, email, email_verified |
| Share on LinkedIn | `w_member_social` | `POST /v2/ugcPosts` — create text, article-link, or image posts |
| Events Management API | Requires separate partner application + approval | Event creation/management (deferred; NOT self-serve) |

Everything else — connections, people search, messaging, job APIs, company admin, post analytics — requires Partner Program approval that has NOT been granted. Build only what the approved scopes support.

---

## Table Stakes

Features users expect. Missing = integration feels broken.

| Feature | Tool Name | Why Expected | Complexity | LinkedIn API |
|---------|-----------|--------------|------------|--------------|
| Fetch own profile | `getProfile` | "Who am I logged in as?" is the first thing any user asks | Low | `GET /v2/userinfo` |
| Create a text post | `postUpdate` | The primary use case in PROJECT.md; core value of the integration | Medium | `POST /v2/ugcPosts` |
| Check auth status | `getAuthStatus` | Users need to know if they are connected before issuing commands | Low | No API call; token introspection only |

### Tool Schema: `getProfile`

```typescript
server.registerTool(
  'getProfile',
  {
    title: 'Get LinkedIn Profile',
    description:
      'Retrieve the authenticated user\'s LinkedIn profile. ' +
      'Returns name, headline, email, profile picture URL, and LinkedIn member ID (sub). ' +
      'Use this before posting to confirm which account is connected.',
    inputSchema: z.object({}),  // no parameters — always returns current user
    outputSchema: z.object({
      sub: z.string().describe('LinkedIn member identifier (pairwise, opaque)'),
      name: z.string().describe('Full display name'),
      given_name: z.string().describe('First name'),
      family_name: z.string().describe('Last name'),
      picture: z.string().url().optional().describe('Profile photo URL'),
      email: z.string().email().optional().describe('Primary email (may be absent)'),
      email_verified: z.boolean().optional(),
      locale: z.string().describe('Member locale, e.g. "en-US"'),
    }),
    annotations: { idempotentHint: true, destructiveHint: false },
  },
  async () => { /* call GET /v2/userinfo */ }
);
```

Key design decisions:
- No parameters. The tool always operates on the authenticated session. Do not accept a `memberId` parameter — the approved scopes do not allow fetching other members' profiles.
- `outputSchema` declared so ChatGPT can reference structured fields downstream (e.g., extracting `sub` for use in `postUpdate`).
- `idempotentHint: true` — safe to call multiple times.

### Tool Schema: `postUpdate`

```typescript
server.registerTool(
  'postUpdate',
  {
    title: 'Post Update to LinkedIn',
    description:
      'Create a new LinkedIn post on behalf of the authenticated user. ' +
      'Supports plain text posts and posts with an article/URL attachment. ' +
      'Image posts are not supported in this version. ' +
      'Posts are PUBLIC by default; pass visibility "CONNECTIONS" to limit to 1st-degree connections. ' +
      'Returns the ID of the created post.',
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(3000)
        .describe('The post body text. Markdown is NOT rendered by LinkedIn; use plain text.'),
      visibility: z
        .enum(['PUBLIC', 'CONNECTIONS'])
        .default('PUBLIC')
        .describe('Who can see the post. PUBLIC = anyone on LinkedIn. CONNECTIONS = 1st-degree only.'),
      articleUrl: z
        .string()
        .url()
        .optional()
        .describe('Optional URL to attach as an article link. Triggers LinkedIn link preview.'),
      articleTitle: z
        .string()
        .max(400)
        .optional()
        .describe('Optional custom title for the article link (overrides LinkedIn scrape).'),
      articleDescription: z
        .string()
        .max(400)
        .optional()
        .describe('Optional description for the article link preview.'),
    }),
    outputSchema: z.object({
      postId: z.string().describe('LinkedIn UGC post URN, e.g. urn:li:ugcPost:123456'),
      url: z.string().url().describe('Direct URL to the post on LinkedIn'),
    }),
    annotations: { idempotentHint: false, destructiveHint: false },
  },
  async ({ text, visibility, articleUrl, articleTitle, articleDescription }) => {
    // Build ugcPosts body; shareMediaCategory = NONE or ARTICLE
  }
);
```

Key design decisions:
- `text` max 3000 chars matches LinkedIn's observed limit for standard posts.
- `articleUrl` optional keeps the tool unified — one tool for text and link posts. Do not split into `postTextUpdate` + `postArticleUpdate`; LLMs handle optional fields well and two tools confuse routing.
- `visibility` defaults to PUBLIC. Most users want public posts; CONNECTIONS should be explicit.
- Do NOT accept `authorUrn` as a parameter. The server always resolves this from the authenticated session token (call `getProfile` or cache the sub-to-URN mapping). Exposing the author URN as input creates an injection risk.
- `idempotentHint: false` — posting twice creates duplicate posts. ChatGPT should not retry silently.

### Tool Schema: `getAuthStatus`

```typescript
server.registerTool(
  'getAuthStatus',
  {
    title: 'Check LinkedIn Authentication Status',
    description:
      'Check whether the user has an active LinkedIn session. ' +
      'Returns connected status and the member name if authenticated. ' +
      'If not connected, returns a re-auth URL. ' +
      'Call this if you are unsure whether the user is logged in before attempting other tools.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      connected: z.boolean(),
      memberName: z.string().optional(),
      reAuthUrl: z.string().url().optional().describe('Present only when connected is false'),
    }),
    annotations: { idempotentHint: true, destructiveHint: false },
  },
  async () => { /* check token store, return status */ }
);
```

---

## Differentiators

Features that create real value beyond the baseline. Assessed against approved API access.

| Feature | Tool Name | Feasibility | Value | Approved? | Complexity |
|---------|-----------|-------------|-------|-----------|------------|
| Post with article link | Part of `postUpdate` (articleUrl param) | HIGH | Users frequently share URLs to articles | YES (`w_member_social`, `ARTICLE` shareMediaCategory) | Low — already in `postUpdate` schema |
| Schedule post (draft state) | `scheduleDraft` | MEDIUM | Content calendar use case | PARTIAL — `lifecycleState: DRAFT` supported by ugcPosts API; scheduling requires polling or a separate job | High |
| Delete own post | `deletePost` | HIGH | Mistake recovery; users want undo | YES (`DELETE /v2/ugcPosts/{postId}`, requires `w_member_social`) | Low |
| List own recent posts | `getMyPosts` | LOW-MEDIUM | See what has been posted; useful for context | UNCERTAIN — `GET /v2/ugcPosts?q=authors&authors=...` requires `r_member_social` scope, which is NOT in the self-serve Share on LinkedIn product | High (scope unclear) |
| Events creation | `createEvent` | LOW | Event organizers; real niche use | Events Management API requires separate PARTNER application; NOT self-serve despite being "approved" | Very High |

### Recommended Differentiator for v1: `deletePost`

This is the highest-value, lowest-complexity differentiator. Most LinkedIn integrations only expose posting. The ability to delete is table stakes for users who post via AI (mistakes happen). Include it in the MVP.

```typescript
server.registerTool(
  'deletePost',
  {
    title: 'Delete LinkedIn Post',
    description:
      'Delete a LinkedIn post created by the authenticated user. ' +
      'Requires the post ID returned by postUpdate. ' +
      'This action is permanent and cannot be undone.',
    inputSchema: z.object({
      postId: z
        .string()
        .describe('The LinkedIn UGC post URN to delete, e.g. urn:li:ugcPost:123456'),
    }),
    outputSchema: z.object({
      deleted: z.boolean(),
      postId: z.string(),
    }),
    annotations: { idempotentHint: false, destructiveHint: true },
  },
  async ({ postId }) => { /* DELETE /v2/ugcPosts/{postId} */ }
);
```

Note: `destructiveHint: true` signals to ChatGPT clients to show a confirmation before calling. The MCP spec states this annotation is informational; implement a confirmation prompt in the ChatGPT App manifest as well.

### `getMyPosts` — Deferred, Scope Uncertain

The `r_member_social` scope (needed to read your own posts via the API) is NOT included in the self-serve Share on LinkedIn product. It may be available as part of some partner products. Attempting to call `GET /v2/ugcPosts?q=authors` without this scope will return a 403. Do NOT build this tool until scope availability is confirmed.

---

## Anti-Features

Things to explicitly not build in v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| `getConnections` / `searchPeople` | Connections API and People Search are Partner-only. 403 guaranteed. Building it creates a tool that always fails. | Do not expose. If users ask "show my connections", respond with a friendly explanation in the tool's error message. |
| `sendMessage` | LinkedIn Messaging API is restricted to Sales Navigator partners. Any attempt will fail. | Out of scope; state clearly in documentation. |
| `acceptInvitation` / `sendInvite` | Network invitations API is partner-only (Recruiter product). | Out of scope. |
| `getPostAnalytics` | Post analytics via API requires Marketing Developer Platform partner access. `r_organization_social` scope needed. Not approved. | Out of scope for consumer integration. |
| `getCompanyPage` | Company page APIs require company admin role AND Marketing API partner access. Not approved for consumer OAuth. | Out of scope. |
| `imagePost` (standalone tool) | Image posting requires a multi-step register-then-upload flow. In v1, complexity is not justified. More importantly, the MCP transport does not natively handle binary uploads from ChatGPT. | Add articleUrl to `postUpdate` for rich link previews instead. Image post support is v2. |
| `searchJobs` / `applyJob` | LinkedIn Jobs API is partner-only and requires Talent Solutions partnership. | Out of scope permanently unless partnership changes. |
| `schedulePost` | Draft state is API-supported but scheduling requires a cron/queue infrastructure. Adds significant backend complexity. | Defer to v2 when queue infrastructure exists. |
| `getUserFeed` | Reading the feed requires `r_liteprofile` + `r_member_social` scopes unavailable without partner access. | Out of scope. |

---

## Tool Naming Convention

**Use camelCase for tool names.** Rationale:

- The MCP spec (2025-06-18) gives `getUser` and `DATA_EXPORT_v2` as valid examples, showing camelCase is the idiomatic TypeScript/JSON convention.
- The official TypeScript SDK examples use camelCase throughout (`calculate-bmi` is shown with a hyphen, but this is a single outlier).
- ChatGPT's function-call routing handles camelCase reliably; snake_case is more common in Python SDKs.
- LinkedIn's own API uses camelCase in JSON field names (`given_name` is the exception as it follows OIDC spec).

Convention: `verbNoun` pattern — `getProfile`, `postUpdate`, `deletePost`, `getAuthStatus`.

**Use camelCase for inputSchema property names** — `articleUrl`, `articleTitle`, `postId`. This matches Zod conventions and the TypeScript SDK.

---

## Pagination and Rate Limit Handling

### Rate Limits (confirmed from LinkedIn docs)

| Limit | Value | Scope |
|-------|-------|-------|
| Daily per-member requests (Share API) | 150 | Per OAuth user, resets UTC midnight |
| Daily per-application requests (Share API) | 100,000 | Across all users of the app |
| OIDC userinfo | Not published, treated as standard OAuth limit | Per token |

### Design Rules

1. **Surface rate limit errors as readable text, not HTTP codes.** When LinkedIn returns 429, return an MCP tool result with `isError: true` and text: `"LinkedIn rate limit reached. The API allows 150 posts per day per user. Try again after midnight UTC."` Do not propagate raw HTTP errors.

2. **No pagination needed in v1.** The approved tools (`getProfile`, `postUpdate`, `deletePost`) are all single-item operations. Pagination only becomes relevant when `getMyPosts` is added in v2.

3. **Partial results are not applicable in v1** — each tool is a single-operation call. When v2 adds list tools, use the cursor-based pagination pattern from the MCP spec (`nextCursor` in results) rather than offset pagination.

4. **Retry strategy.** For transient 5xx errors from LinkedIn, implement a single automatic retry with 1-second backoff. For 429s and 4xx errors, do NOT retry — surface immediately to the user.

5. **Token refresh is transparent.** The server refreshes expired access tokens silently before any tool call. If refresh fails (expired refresh token), tools return `isError: true` with a re-auth URL. Do not expose token mechanics in tool outputs.

---

## Complexity Estimates

| Tool | Complexity | Key Work |
|------|------------|----------|
| `getAuthStatus` | Low | Token store lookup, no LinkedIn API call |
| `getProfile` | Low | Single GET to `/v2/userinfo`, straightforward mapping |
| `postUpdate` (text only) | Medium | ugcPosts body construction, author URN resolution |
| `postUpdate` (with articleUrl) | Medium | Same + shareMediaCategory = ARTICLE |
| `deletePost` | Low | Single DELETE to `/v2/ugcPosts/{id}`, validate ownership |
| `getMyPosts` | High | Scope uncertainty + pagination + author URN construction |
| `createEvent` | Very High | Partner application required; not currently possible |
| `imagePost` | High | Binary upload flow, 3-step process, MCP binary transport complexity |

---

## MVP Tool Set (Ordered by Build Priority)

1. `getAuthStatus` — build first; every other tool depends on auth working
2. `getProfile` — build second; validates OIDC flow end-to-end
3. `postUpdate` (text + articleUrl) — core value delivery
4. `deletePost` — highest-value differentiator; low complexity

Defer all other tools to v2 or later phases.

---

## Sources

- MCP specification (2025-06-18 draft): https://modelcontextprotocol.io/specification/draft/server/tools
- MCP TypeScript SDK docs: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- LinkedIn Share on LinkedIn product: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- LinkedIn Sign In with LinkedIn (OIDC): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- LinkedIn Events Management API (partner-only): https://developer.linkedin.com/product-catalog/marketing/event-management-api
- LinkedIn Connections API (partner-only): https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api
