import "dotenv/config";
import { loadSessions, saveSessions } from "./auth/session-persist.js";
import { loadUserRegistry } from "./auth/user-registry.js";
import { loadPostHistory } from "./analytics/post-history.js";
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
import { oauthRoutes } from "./routes/oauth.js";
import { routineRoutes } from "./routes/routine.js";
import { landingRoutes } from "./routes/landing.js";
import { adminRoutes } from "./routes/admin.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { openapiRoutes } from "./routes/openapi.js";

// Load persisted data from disk (survives server restarts)
loadSessions();
loadUserRegistry();
loadPostHistory();
// Save sessions every 5 minutes and on exit
setInterval(saveSessions, 5 * 60 * 1000).unref();
process.on("SIGINT", () => { saveSessions(); process.exit(0); });
process.on("SIGTERM", () => { saveSessions(); process.exit(0); });

const app = new Hono<{ Bindings: HttpBindings }>();

// Security middleware — order is significant:
// originGuard runs first to block disallowed cross-origin requests before any route logic
// authChallenge runs after route handlers to annotate 401 responses with WWW-Authenticate
app.use("*", originGuard);
app.use("*", authChallenge);

// Health check (Phase 1 — do not remove)
app.get("/health", (c) => c.json({ status: "ok" }));

// Landing page (must be before mcpRoutes to capture GET /)
app.route("/", landingRoutes);

// Admin dashboard
app.route("/admin", adminRoutes);

// Per-user analytics dashboard (real post history, no fabricated metrics)
app.route("/dashboard", dashboardRoutes);

// LinkedIn OAuth routes (browser flow — unauthenticated)
app.route("/auth", authRoutes);

// OAuth AS routes for ChatGPT (authorize + token)
app.route("/oauth", oauthRoutes);

// Scheduled routine endpoints (called by Claude routines with Bearer JWT)
app.route("/routine", routineRoutes);

// MCP Streamable HTTP protocol endpoints (Phase 2 — GET+POST /mcp)
// requireAuth is applied inside mcpRoutes on the tools/call path (see routes/mcp.ts)
app.route("/", mcpRoutes);

// OAuth Protected Resource discovery (Phase 2 — MCP-07)
app.route("/.well-known", wellKnownRoutes);

// OpenAPI spec — for Google Agentspace, Gemini, n8n, Zapier, any OpenAPI client
app.route("/", openapiRoutes);

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
