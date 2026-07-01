import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import { config } from "./config.js";
import { originGuard } from "./middleware/origin.js";
import { authChallenge } from "./middleware/auth-challenge.js";
import { sanitizeErrors } from "./middleware/sanitize-errors.js";
import { mcpRoutes } from "./routes/mcp.js";
import { wellKnownRoutes } from "./routes/well-known.js";
import { authRoutes } from "./routes/auth.js";

const app = new Hono<{ Bindings: HttpBindings }>();

// Security middleware — order is significant:
// originGuard runs first to block disallowed cross-origin requests before any route logic
// authChallenge runs after route handlers to annotate 401 responses with WWW-Authenticate
app.use("*", originGuard);
app.use("*", authChallenge);

// Health check (Phase 1 — do not remove)
app.get("/health", (c) => c.json({ status: "ok" }));

// LinkedIn OAuth routes (Phase 3 — unauthenticated, must be registered BEFORE requireAuth)
app.route("/auth", authRoutes);

// MCP Streamable HTTP protocol endpoints (Phase 2 — GET+POST /mcp)
// requireAuth is applied inside mcpRoutes on the tools/call path (see routes/mcp.ts)
app.route("/", mcpRoutes);

// OAuth Protected Resource discovery (Phase 2 — MCP-07)
app.route("/.well-known", wellKnownRoutes);

// Error sanitization — must be registered AFTER all routes
app.onError(sanitizeErrors);

serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(
      `[server] LinkedIn MCP server running on http://localhost:${info.port}`,
    );
  },
);

export { app };
