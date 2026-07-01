/**
 * Admin routes — GET /admin/users
 * Protected by ADMIN_SECRET query param.
 */

import { Hono } from "hono";
import { getAllUsers } from "../auth/user-registry.js";
import { sessionStore } from "../auth/session.js";
import { updateCompanyPageHandler } from "../tools/update-company-page.js";

export const adminRoutes = new Hono();

const START_TIME = Date.now();

function checkAdminSecret(c: Parameters<typeof adminRoutes.get>[1] extends (c: infer C) => unknown ? C : never): boolean {
  const adminSecret = process.env["ADMIN_SECRET"] ?? "";
  if (!adminSecret) return false;
  const provided = c.req.query("secret") ?? "";
  return provided === adminSecret && provided !== "";
}

/**
 * POST /admin/update-company-page?secret=ADMIN_SECRET
 * Calls the LinkedIn API to update the OgeonX AI company page profile.
 * Uses the first active session found in the session store.
 */
adminRoutes.get("/update-company-page", async (c) => {
  if (!checkAdminSecret(c)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Find any active session with a valid access token
  let accessToken: string | undefined;
  for (const session of sessionStore.values()) {
    if (session.accessToken && session.expiresAt > Date.now()) {
      accessToken = session.accessToken;
      break;
    }
  }

  if (!accessToken) {
    return c.json({ error: "No active LinkedIn session. Visit /auth/login first." }, 401);
  }

  const result = await updateCompanyPageHandler({ accessToken });
  const text = result.content[0]?.text ?? "";
  return c.json({ ok: !result.isError, result: text });
});

adminRoutes.get("/users", (c) => {
  const adminSecret = process.env["ADMIN_SECRET"] ?? "";
  if (!adminSecret) {
    return c.json({ error: "Admin endpoint disabled — set ADMIN_SECRET to enable" }, 403);
  }

  const provided = c.req.query("secret") ?? "";
  if (!provided || provided !== adminSecret) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const users = getAllUsers();
  const uptimeMs = Date.now() - START_TIME;
  const uptimeSec = Math.floor(uptimeMs / 1000);

  return c.json({
    uptime_seconds: uptimeSec,
    session_count: sessionStore.size,
    user_count: users.length,
    users,
  });
});
