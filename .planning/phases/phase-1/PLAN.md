# Phase 1: Project Bootstrap — PLAN.md

## Goal

Stand up a TypeScript/Hono server that starts on localhost:3000 with a single command, validates required env vars at boot, exposes a health endpoint, and compiles to a clean `dist/` with `npm run build`.

**Requirements covered:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, DEV-03

---

## Must-Haves

**Observable truths:**
- `npm install && npm run dev` boots the server on port 3000 with no errors
- `GET /health` returns `{ "status": "ok" }` with HTTP 200
- `npm run build` produces `dist/index.js` with zero TypeScript errors (strict mode)
- Server exits with a clear error message if any required env var is missing
- `.env` never enters git history; `.env.example` documents every variable

**Required artifacts:**
- `package.json` — scripts: dev, build, start; correct dependencies
- `tsconfig.json` — strict mode, ESM output
- `tsup.config.ts` — builds `src/index.ts` → `dist/`
- `src/config.ts` — zod env schema, exits on validation failure
- `src/index.ts` — Hono app, mounts /health, starts on PORT
- `.env.example` — lists all five required vars
- `.gitignore` — excludes node_modules, dist, .env

**Key links:**
- `src/index.ts` imports `config` from `src/config.ts` — if config throws, process exits before `app.listen`
- `tsup.config.ts` entry points to `src/index.ts` — mismatched path = silent build failure
- `package.json` `"type": "module"` must align with tsconfig `"module": "ESNext"` — mismatch = runtime crash

---

## Tasks

### Task 1: Package manifest and TypeScript configuration

**Files:**
- `C:/OgeonX-AI/package.json`
- `C:/OgeonX-AI/tsconfig.json`
- `C:/OgeonX-AI/tsup.config.ts`

**What:**

Create `package.json` as an ESM package (`"type": "module"`) with the following exact content:

```json
{
  "name": "linkedin-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "hono": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Create `tsup.config.ts`:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
});
```

**Acceptance:**
- `npm install` completes without errors
- `npx tsc --noEmit` exits 0 (after src files exist in Task 3)
- `tsup.config.ts` is valid TypeScript — `npx tsx tsup.config.ts` produces no syntax errors

---

### Task 2: Environment validation module

**Files:**
- `C:/OgeonX-AI/src/config.ts`

**What:**

Create `src/config.ts` using zod to parse and validate all required environment variables. The module must call `process.exit(1)` with a human-readable message listing every missing/invalid variable if validation fails — it must never throw an unhandled exception.

```typescript
import { z } from "zod";

const envSchema = z.object({
  LINKEDIN_CLIENT_ID: z.string().min(1, "LINKEDIN_CLIENT_ID is required"),
  LINKEDIN_CLIENT_SECRET: z.string().min(1, "LINKEDIN_CLIENT_SECRET is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (use a random secret)"),
  PORT: z
    .string()
    .optional()
    .default("3000")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(65535)),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .default("http://localhost:3000")
    .transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean)),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.flatten().fieldErrors;
  const lines = Object.entries(errors)
    .map(([field, msgs]) => `  ${field}: ${(msgs ?? []).join(", ")}`)
    .join("\n");
  console.error(`[config] Server startup failed — missing or invalid environment variables:\n${lines}`);
  console.error(`[config] Copy .env.example to .env and fill in the required values.`);
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
```

The exported `config` object is the single source of truth for all env-derived values throughout the codebase. No other file should read `process.env` directly.

**Acceptance:**
- Running `node --import tsx/esm src/config.ts` with all five vars set exits 0
- Running it with `LINKEDIN_CLIENT_ID` unset prints the field name and exits 1
- Running it with `SESSION_SECRET` shorter than 32 chars prints the length error and exits 1
- `PORT` defaults to 3000 when not set; parses correctly when set to `"8080"`
- `ALLOWED_ORIGINS` splits comma-separated string into an array

---

### Task 3: Hono application entry point and health endpoint

**Files:**
- `C:/OgeonX-AI/src/index.ts`

**What:**

Create `src/index.ts` as the Hono application entry point. It must:
1. Import `config` from `./config.ts` as the first side-effectful import (so missing env vars abort before any server setup)
2. Create a Hono app
3. Mount `GET /health` returning `{ status: "ok" }` as JSON with HTTP 200
4. Start the Node.js HTTP server on `config.PORT`
5. Log the port to stdout on successful start

```typescript
import { config } from "./config.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(`[server] LinkedIn MCP server running on http://localhost:${info.port}`);
  }
);

export default app;
```

Note: Hono's Node.js adapter is `@hono/node-server`. Add it to `package.json` dependencies:
`"@hono/node-server": "^1.12.0"`

Update `package.json` dependencies to include `@hono/node-server` and run `npm install` again after adding it.

**Acceptance:**
- `npm run dev` starts with no TypeScript or runtime errors
- `curl http://localhost:3000/health` returns `{"status":"ok"}` with HTTP 200
- Server stdout shows `[server] LinkedIn MCP server running on http://localhost:3000`
- Killing the process and restarting with `SESSION_SECRET` unset prints the config error and exits without binding any port

---

### Task 4: Project scaffolding files

**Files:**
- `C:/OgeonX-AI/.env.example`
- `C:/OgeonX-AI/.gitignore`

**What:**

Create `.env.example` documenting every environment variable the server consumes. Comments explain where to obtain each value:

```dotenv
# LinkedIn OAuth Application credentials
# Obtain from: https://www.linkedin.com/developers/apps → your app → Auth tab
LINKEDIN_CLIENT_ID=your_linkedin_client_id_here
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret_here

# Session signing secret — must be at least 32 random characters
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=replace_with_at_least_32_random_characters

# Server port (optional, defaults to 3000)
# PORT=3000

# Comma-separated list of allowed request origins (optional, defaults to localhost:3000)
# ALLOWED_ORIGINS=http://localhost:3000,https://your-ngrok-url.ngrok.io
```

Create `.gitignore`:

```gitignore
# Dependencies
node_modules/

# Build output
dist/

# Environment secrets — NEVER commit .env
.env
.env.local
.env.*.local

# OS / editor artifacts
.DS_Store
*.log
npm-debug.log*
.vscode/
.idea/
```

**Acceptance:**
- `.env.example` contains entries for all five vars: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `SESSION_SECRET`, `PORT`, `ALLOWED_ORIGINS`
- `git check-ignore .env` outputs `.env` (confirms .gitignore rule is active — run after `git init` if not already a repo)
- `.env` does not appear in `git ls-files`

---

### Task 5: Build verification

**Files:** (no new files — verifies the full setup end-to-end)

**What:**

Run the full build pipeline and verify all acceptance criteria are met:

1. `npm run build` — must exit 0 and produce `dist/index.js`
2. Inspect `dist/index.js` exists and is non-empty
3. Confirm no TypeScript errors: `npx tsc --noEmit`
4. Start the built artifact: copy `.env.example` to `.env`, fill in placeholder values (use any 32-char string for `SESSION_SECRET`), then `npm start` — server must bind port 3000
5. `curl http://localhost:3000/health` against the built artifact — must return `{"status":"ok"}`

If `npm run build` fails due to TypeScript errors, fix them before marking this task done. Common issues to pre-empt:
- Import paths in `src/index.ts` must use `.js` extension (ESM Node requirement), not `.ts`
- `@hono/node-server` must be in `dependencies` (not just installed)
- `tsup.config.ts` must import from `tsup` which is a devDependency — this is fine, tsup resolves it at build time

**Acceptance:**
- `npm run build` exits 0
- `dist/index.js` exists and is > 1 KB
- `npx tsc --noEmit` exits 0 with no errors printed
- `npm start` (with valid `.env`) binds port 3000 and responds to `GET /health` with `{"status":"ok"}`
- The `.env` file used for testing is NOT staged or committed to git

---

## Execution Order

```
Task 1 (package.json, tsconfig, tsup)
    ↓
Task 2 (src/config.ts)
    ↓
Task 3 (src/index.ts)       Task 4 (.env.example, .gitignore)
         ↓                           ↓
              Task 5 (build verification)
```

Tasks 3 and 4 can be done in parallel; Task 5 requires all others complete.

---

## Threat Model

| Boundary | Description |
|----------|-------------|
| env → process | Secrets loaded from OS environment at startup |
| HTTP client → /health | Unauthenticated public endpoint |

| Threat | Category | Disposition | Mitigation |
|--------|----------|-------------|------------|
| Hardcoded secrets in source | Information Disclosure | Mitigate | zod schema reads only from `process.env`; config module is the sole env accessor |
| `.env` committed to git | Information Disclosure | Mitigate | `.gitignore` entry + `.env.example` pattern enforced in Task 4 |
| Weak SESSION_SECRET | Elevation of Privilege | Mitigate | zod enforces `min(32)` — server refuses to start with short secret |
| Health endpoint DDoS | Denial of Service | Accept | Phase 1 MVP; rate limiting deferred to Phase 5 |

---

## Success Criteria

All five of these must be true for Phase 1 to be complete:

1. `npm install && npm run dev` starts the server on localhost:3000 with no errors in stdout or stderr
2. `curl -s http://localhost:3000/health | grep '"status":"ok"'` exits 0
3. `npm run build` exits 0; `ls dist/index.js` shows the file exists
4. Starting the server with `SESSION_SECRET` unset prints a clear error message and exits non-zero — no port is bound
5. `git ls-files | grep -x '.env'` returns empty (`.env` not tracked)

---

## Output

After completing all tasks, create `.planning/phases/phase-1/SUMMARY.md` with:
- What was built (files created, packages installed)
- Any deviations from this plan and why
- Actual package versions resolved by npm
- Confirmation of all five success criteria above
