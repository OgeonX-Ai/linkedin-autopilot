---
phase: 05-security-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/config.ts
  - src/middleware/sanitize-errors.ts
  - src/linkedin/client.ts
  - .gitignore
autonomous: true
requirements: [SEC-01, SEC-02, SEC-04, SEC-05]

must_haves:
  truths:
    - "Server refuses to start if SESSION_SECRET is absent or shorter than 32 characters"
    - "Server refuses to start if LINKEDIN_CLIENT_SECRET is absent"
    - "A successful startup prints one confirmation log line — no secret values appear in it"
    - "No error message, log line, or HTTP response body can contain the client secret string"
    - "Every LinkedIn API call carries both Authorization: Bearer and LinkedIn-Version headers"
    - "A shared linkedinFetch() helper enforces both headers — callers cannot omit them"
    - ".env is listed in .gitignore and does not appear in any git commit"
  artifacts:
    - path: "src/config.ts"
      provides: "Startup validation and typed config export"
      exports: [config, validateConfig]
    - path: "src/middleware/sanitize-errors.ts"
      provides: "Express error handler that redacts client secret from all output"
      exports: [sanitizeErrors]
    - path: "src/linkedin/client.ts"
      provides: "linkedinFetch() helper that enforces required headers"
      exports: [linkedinFetch]
    - path: ".gitignore"
      provides: "Ensures .env is never tracked"
      contains: ".env"
  key_links:
    - from: "src/config.ts"
      to: "process.env"
      via: "validateConfig() called before server.listen()"
      pattern: "process\\.exit\\(1\\)"
    - from: "src/middleware/sanitize-errors.ts"
      to: "express app"
      via: "app.use(sanitizeErrors) after all routes"
      pattern: "sanitizeErrors"
    - from: "src/linkedin/client.ts"
      to: "https://api.linkedin.com"
      via: "linkedinFetch() wrapping every fetch call"
      pattern: "linkedinFetch"
---

<objective>
Harden the server against credential leakage, missing-header bugs, and accidental secret commits.

Purpose: Enforce SEC-01, SEC-02, SEC-04, SEC-05 so the server can never run with weak secrets,
cannot leak the client secret through any output channel, cannot make a LinkedIn API call without
the required headers, and cannot have .env committed to git.

Output:
- src/config.ts — startup validator with fail-fast behavior
- src/middleware/sanitize-errors.ts — redacting error handler
- src/linkedin/client.ts — shared fetch helper with enforced headers
- .gitignore — confirmed to include .env
</objective>

<execution_context>
@C:/Users/KimHarjamäki/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/KimHarjamäki/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/OgeonX-AI/.planning/PROJECT.md
@C:/OgeonX-AI/.planning/ROADMAP.md
@C:/OgeonX-AI/.planning/REQUIREMENTS.md

<!-- Runtime: TypeScript / Node.js / Express -->
<!-- All secrets come from process.env; no secrets are ever hardcoded -->
<!-- LinkedIn API base: https://api.linkedin.com -->
<!-- Required LinkedIn-Version header value: 202304 -->
</context>

<tasks>

<!-- ═══════════════════════════════════════════════════════════
     TASK 1 — Startup validation in src/config.ts          (SEC-01)
     ═══════════════════════════════════════════════════════════ -->
<task type="auto" tdd="true">
  <name>Task 1: Startup validation — config.ts (SEC-01)</name>
  <files>src/config.ts, src/config.test.ts</files>

  <behavior>
    - validateConfig() with SESSION_SECRET shorter than 32 chars → throws Error("SESSION_SECRET must be at least 32 characters")
    - validateConfig() with SESSION_SECRET absent → throws Error("SESSION_SECRET is required")
    - validateConfig() with LINKEDIN_CLIENT_SECRET absent → throws Error("LINKEDIN_CLIENT_SECRET is required")
    - validateConfig() with all vars present and SESSION_SECRET exactly 32 chars → returns config object without throwing
    - validateConfig() with SESSION_SECRET of 64 chars → returns config object without throwing
    - Returned config object has shape { sessionSecret: string, linkedinClientId: string, linkedinClientSecret: string, linkedinRedirectUri: string, port: number }
    - config.ts calls validateConfig() at module load time and calls process.exit(1) on Error, printing error.message to process.stderr
    - On success, module prints exactly one line to console.log: "Security checks passed — all required env vars present and valid"
    - The success log line does NOT include the value of any secret variable
  </behavior>

  <action>
Write src/config.ts with the following structure (per SEC-01):

1. Define a validateConfig() function (exported for testing) that:
   - Reads SESSION_SECRET, LINKEDIN_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI, PORT from process.env
   - Throws Error("SESSION_SECRET is required") if SESSION_SECRET is undefined or empty string
   - Throws Error("SESSION_SECRET must be at least 32 characters") if SESSION_SECRET.length is less than 32
   - Throws Error("LINKEDIN_CLIENT_SECRET is required") if LINKEDIN_CLIENT_SECRET is undefined or empty string
   - Throws Error("LINKEDIN_CLIENT_ID is required") if LINKEDIN_CLIENT_ID is undefined or empty string
   - Throws Error("LINKEDIN_REDIRECT_URI is required") if LINKEDIN_REDIRECT_URI is undefined or empty string
   - Returns the typed config object on success

2. At module scope (not inside a function):
   - Wrap the validateConfig() call in try/catch
   - On catch: write error.message to process.stderr, call process.exit(1)
   - On success: console.log("Security checks passed — all required env vars present and valid")
   - Export the returned config as `config` (named export)

3. Export the Config type:
   ```ts
   export interface Config {
     sessionSecret: string;
     linkedinClientId: string;
     linkedinClientSecret: string;
     linkedinRedirectUri: string;
     port: number;
   }
   ```

Write src/config.test.ts using Node's built-in test runner (import { test, describe, mock } from 'node:test'; import assert from 'node:assert/strict'):
- Each test case sets process.env variables, calls validateConfig() directly, and asserts thrown message or returned shape
- Use afterEach to restore process.env to a clean state (delete the vars set in each test)
- Do NOT import the module-level side effects — import only the validateConfig export

Do NOT print secret values in any log or error output.
Do NOT use console.error for the failure message — write to process.stderr directly.
  </action>

  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit && node --test src/config.test.ts</automated>
  </verify>

  <done>
    - TypeScript compiles with no errors
    - All config.test.ts cases pass (missing SECRET_SECRET, too-short, missing CLIENT_SECRET, valid inputs)
    - Starting the server with SESSION_SECRET under 32 chars prints the error message and exits with code 1
    - Starting with all valid env vars prints "Security checks passed — all required env vars present and valid"
  </done>
</task>


<!-- ═══════════════════════════════════════════════════════════
     TASK 2 — Error sanitization middleware (SEC-02)
     ═══════════════════════════════════════════════════════════ -->
<task type="auto" tdd="true">
  <name>Task 2: Sanitize-errors middleware (SEC-02)</name>
  <files>src/middleware/sanitize-errors.ts, src/middleware/sanitize-errors.test.ts</files>

  <behavior>
    - sanitizeErrors(err, req, res, next) is a valid Express 4-argument error handler
    - If err.message contains the LINKEDIN_CLIENT_SECRET value, that value is replaced with "[REDACTED]" in the response body
    - If err.stack contains the client secret, it is replaced before any logging
    - The response JSON body is: { error: string } where error is the sanitized message
    - HTTP status is taken from err.status or err.statusCode if present; defaults to 500
    - The raw client secret never appears in any string that leaves the function (response body or console output)
    - sanitizeSecret(input: string, secret: string): string — exported pure helper that replaces all occurrences of secret in input with "[REDACTED]"; safe when secret is empty string (returns input unchanged)
  </behavior>

  <action>
Write src/middleware/sanitize-errors.ts (per SEC-02):

1. Export sanitizeSecret(input: string, secret: string): string
   - If secret is empty string or undefined, return input unchanged
   - Use a regex built from the escaped secret value to replace ALL occurrences with "[REDACTED]"
   - Escape regex special characters in the secret before building the regex
   - Example: sanitizeSecret("token=abc123 error", "abc123") → "token=[REDACTED] error"

2. Export sanitizeErrors: Express.ErrorRequestHandler
   - Read LINKEDIN_CLIENT_SECRET from process.env (do not import from config.ts to avoid circular deps)
   - Sanitize err.message using sanitizeSecret
   - Sanitize err.stack using sanitizeSecret (mutate err.stack in place for any logging)
   - Log the sanitized stack to console.error (never the raw stack)
   - Respond with res.status(status).json({ error: sanitizedMessage })
   - Status = err.status ?? err.statusCode ?? 500

3. The function signature must be exactly 4 parameters (err, req, res, next) so Express recognizes it as an error handler. Include _next in the signature even if unused.

Write src/middleware/sanitize-errors.test.ts:
- Test sanitizeSecret directly: replaces single occurrence, replaces multiple occurrences, safe with empty secret, handles regex special chars in secret (e.g. secret = "a.b$c")
- Test that sanitizeErrors sends { error: "[REDACTED]" } when err.message equals the secret
- Test that sanitizeErrors defaults to status 500 when err has no status
- Test that sanitizeErrors uses err.status when provided
- Mock res with { status: () => ({ json: mock.fn() }) } pattern
  </action>

  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit && node --test src/middleware/sanitize-errors.test.ts</automated>
  </verify>

  <done>
    - All sanitize-errors tests pass
    - sanitizeSecret correctly redacts the secret in all test cases including regex-special-char secrets
    - sanitizeErrors middleware responds with { error: "[REDACTED]" } when message contains the secret
    - No test output includes the raw secret value
  </done>
</task>


<!-- ═══════════════════════════════════════════════════════════
     TASK 3 — linkedinFetch() header-enforcing helper (SEC-04)
     ═══════════════════════════════════════════════════════════ -->
<task type="auto" tdd="true">
  <name>Task 3: linkedinFetch() helper in src/linkedin/client.ts (SEC-04)</name>
  <files>src/linkedin/client.ts, src/linkedin/client.test.ts</files>

  <behavior>
    - linkedinFetch(url: string, accessToken: string, options?: RequestInit): Promise&lt;Response&gt;
    - Every call always includes header "Authorization: Bearer {accessToken}"
    - Every call always includes header "LinkedIn-Version: 202304"
    - Caller-provided headers in options.headers are merged AFTER the required headers (caller cannot override Authorization or LinkedIn-Version)
    - If options.headers tries to set Authorization to a different value, the enforced value wins
    - Returns the raw fetch Response for the caller to handle
    - Does not swallow errors — network errors propagate as-is
  </behavior>

  <action>
Write src/linkedin/client.ts (per SEC-04):

1. Export LINKEDIN_VERSION = "202304" as a named constant (single source of truth)

2. Export linkedinFetch(url: string, accessToken: string, options: RequestInit = {}): Promise&lt;Response&gt;
   - Build a Headers object starting from options.headers (if provided)
   - Then SET (overwrite) "Authorization" to `Bearer ${accessToken}`
   - Then SET (overwrite) "LinkedIn-Version" to LINKEDIN_VERSION
   - Call the global fetch(url, { ...options, headers }) and return the result
   - Do not catch errors — let them propagate to callers

3. If src/linkedin/client.ts already exists from Phase 4 with direct fetch calls, convert those
   call sites to use linkedinFetch() instead. Identify every fetch() call whose URL starts with
   "https://api.linkedin.com" and replace it with a linkedinFetch() call, passing the access
   token from the session. Remove any duplicate header declarations from those call sites.

Write src/linkedin/client.test.ts:
- Mock global fetch using mock.fn() from node:test
- Test: calling linkedinFetch sets Authorization header to "Bearer test-token"
- Test: calling linkedinFetch sets LinkedIn-Version header to "202304"
- Test: if options.headers contains Authorization: "other", the enforced value "Bearer test-token" wins
- Test: non-header options (method, body) are passed through to fetch unchanged
- Test: fetch network error propagates (mock fetch to throw, assert linkedinFetch rejects)
  </action>

  <verify>
    <automated>cd C:/OgeonX-AI && npx tsc --noEmit && node --test src/linkedin/client.test.ts</automated>
  </verify>

  <done>
    - All client.test.ts cases pass
    - Every LinkedIn fetch call in the codebase uses linkedinFetch() — grep confirms no remaining direct fetch("https://api.linkedin.com") calls outside of client.ts
    - TypeScript compiles with no errors
  </done>
</task>


<!-- ═══════════════════════════════════════════════════════════
     TASK 4 — .gitignore audit and git history check (SEC-05)
     ═══════════════════════════════════════════════════════════ -->
<task type="auto">
  <name>Task 4: .gitignore enforcement and git history audit (SEC-05)</name>
  <files>.gitignore</files>

  <action>
Perform the following steps in order (per SEC-05):

STEP 1 — Read .gitignore (create it if absent):
- Check whether `.env` (exact line, not `.env.local` or `*.env`) appears in .gitignore
- If missing, add the following block at the end of .gitignore (preserving existing content):

  # Environment secrets — never commit
  .env
  .env.local
  .env.*.local

- Do NOT remove any existing entries

STEP 2 — Check git history:
Run: git -C C:/OgeonX-AI log --all --oneline -- .env

If the command returns any output (commits found):
- Print a WARNING to the human: ".env appears in git history. To purge it, run: git filter-repo --path .env --invert-paths"
- Do NOT automatically rewrite history — this requires the human to confirm and re-force-push
- Record the warning in the task summary so the human is not surprised

If the command returns no output: record "git history clean — .env never committed"

STEP 3 — Verify .gitignore is itself tracked:
Run: git -C C:/OgeonX-AI status .gitignore
If .gitignore is untracked or modified, stage it: git -C C:/OgeonX-AI add .gitignore

STEP 4 — Confirm with a grep gate:
Run: grep -v '^#' C:/OgeonX-AI/.gitignore | grep -c '^\.env$'
Result must be >= 1. If 0, re-add the .env line and re-check.
  </action>

  <verify>
    <automated>grep -v "^#" C:/OgeonX-AI/.gitignore | grep -c "^\.env$"</automated>
  </verify>

  <done>
    - grep gate returns >= 1 (bare .env line present in .gitignore, not counting comment lines)
    - git log --all -- .env returns empty (or human is warned if not)
    - .gitignore is staged or already committed
  </done>
</task>


<!-- ═══════════════════════════════════════════════════════════
     TASK 5 — MCP SDK version audit (CVE — Origin validation)
     ═══════════════════════════════════════════════════════════ -->
<task type="auto">
  <name>Task 5: Audit and pin MCP SDK version >= 1.24.0</name>
  <files>package.json</files>

  <action>
STEP 1 — Check current SDK version:
  node -e "console.log(require('./node_modules/@modelcontextprotocol/sdk/package.json').version)"

STEP 2 — If version is below 1.24.0:
  npm install @modelcontextprotocol/sdk@latest
  npm run build
  Confirm TypeScript still compiles with no errors.

STEP 3 — Verify Origin validation is active:
  Start server: npm run dev (in background)
  Send a request with a bad Origin header:
    curl -X POST http://localhost:3000/mcp \
      -H "Origin: https://evil.example.com" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
  Expected: HTTP 403 response.
  If 403 is returned, Origin validation is working.
  If 200 is returned, SDK version is too old — upgrade and retry.

STEP 4 — Record result in task summary:
  - SDK version installed: X.Y.Z
  - Origin rejection test: PASS or FAIL
  - Action taken: (none / upgraded to X.Y.Z)
  </action>

  <verify>
    <automated>node -e "const v=require('./node_modules/@modelcontextprotocol/sdk/package.json').version; const [maj,min]=v.split('.').map(Number); if(maj<1||min<24) throw new Error('SDK '+v+' is below 1.24.0 — Origin validation CVE not fixed'); console.log('SDK',v,'OK')"</automated>
  </verify>

  <done>
    - @modelcontextprotocol/sdk version in node_modules is >= 1.24.0
    - curl test with bad Origin returns HTTP 403
    - package.json dependency pinned to >= 1.24.0
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process.env → application | Secrets enter here; must be validated before any server socket opens |
| application → LinkedIn API | Outbound calls must carry correct auth headers; missing headers = rejected requests or wrong-user data |
| error messages → HTTP responses | Unhandled errors may reflect internal state including secret values |
| git working tree → remote | Accidentally staged .env exposes secrets to anyone with repo read access |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-01 | Information Disclosure | src/config.ts | mitigate | validateConfig() aborts process before any network binding if secrets are weak or absent; error output goes to stderr without printing secret values |
| T-05-02 | Information Disclosure | Express error handler | mitigate | sanitizeErrors middleware replaces all occurrences of LINKEDIN_CLIENT_SECRET in err.message and err.stack with "[REDACTED]" before writing to response or console |
| T-05-03 | Spoofing | src/linkedin/client.ts | mitigate | linkedinFetch() always overwrites Authorization header — caller cannot supply a forged or stale token by accident |
| T-05-04 | Information Disclosure | .gitignore / git history | mitigate | .env entry enforced in .gitignore; git log audit run at plan execution time; human warned if purge needed |
| T-05-05 | Elevation of Privilege | SESSION_SECRET entropy | mitigate | Minimum 32-character enforcement in validateConfig() prevents weak session secrets that would allow session forgery |
| T-05-06 | Information Disclosure | LinkedIn-Version header absent | accept | Missing version header causes API to use a different (not older) default; mitigated by SEC-04 enforcement; no credential leak risk |
</threat_model>

<verification>
After all four tasks complete, verify the phase as a whole:

1. TypeScript compile check (covers all new files):
   cd C:/OgeonX-AI && npx tsc --noEmit

2. All unit tests pass:
   node --test src/config.test.ts src/middleware/sanitize-errors.test.ts src/linkedin/client.test.ts

3. No raw LinkedIn API fetch calls remain outside client.ts:
   grep -rn "fetch(\"https://api.linkedin.com" src/ --include="*.ts" | grep -v "src/linkedin/client.ts"
   (expect: no output)

4. .env present in .gitignore (grep gate):
   grep -v "^#" .gitignore | grep -c "^\.env$"
   (expect: >= 1)

5. .env absent from git history:
   git log --all --oneline -- .env
   (expect: no output)

6. Startup secret confirmation (manual spot-check):
   SESSION_SECRET=$(openssl rand -hex 32) LINKEDIN_CLIENT_ID=x LINKEDIN_CLIENT_SECRET=y LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/callback node -e "require('./dist/config')"
   (expect: "Security checks passed — all required env vars present and valid" on stdout, no secret values printed)
</verification>

<success_criteria>
- SEC-01: Server exits with code 1 and a human-readable error if SESSION_SECRET is absent or < 32 chars
- SEC-01: Server exits with code 1 if LINKEDIN_CLIENT_SECRET is absent
- SEC-01: Successful startup emits one confirmation log line containing no secret values
- SEC-02: sanitizeErrors middleware is registered in the Express app after all routes
- SEC-02: Any error whose message or stack contains the client secret is redacted to "[REDACTED]" before the response is sent
- SEC-04: linkedinFetch() is the only function that calls fetch() against api.linkedin.com
- SEC-04: linkedinFetch() always sets Authorization: Bearer and LinkedIn-Version: 202304, regardless of caller-supplied headers
- SEC-05: .gitignore contains a bare .env line (not .env.local only)
- SEC-05: git log --all -- .env returns no commits, or human has been warned and given the purge command
</success_criteria>

<output>
After all tasks are complete and verified, create:
.planning/phases/phase-5/05-01-SUMMARY.md

Include:
- Tasks completed and files modified
- Test counts and pass/fail
- git history audit result (clean or warning issued)
- Any decisions made during implementation (e.g., regex escaping approach for sanitizeSecret)
- Any deviations from this plan and why
</output>
