/**
 * Admin routes — GET /admin/users
 * Protected by ADMIN_SECRET query param.
 */

import { Hono } from "hono";
import { getAllUsers } from "../auth/user-registry.js";
import { sessionStore } from "../auth/session.js";

export const adminRoutes = new Hono();

const START_TIME = Date.now();

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
