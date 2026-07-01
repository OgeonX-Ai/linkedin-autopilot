import type { MiddlewareHandler } from "hono";
import { config } from "../config.js";

export const originGuard: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin");

  // Allow requests with no Origin header (direct API calls, curl, health checks)
  // Block requests with an Origin that is not in the allowlist
  if (origin !== undefined && !config.ALLOWED_ORIGINS.includes(origin)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return await next();
};
