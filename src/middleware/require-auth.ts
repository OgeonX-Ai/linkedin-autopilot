/**
 * requireAuth — Hono middleware that gates MCP tool calls behind a valid LinkedIn session.
 *
 * When the session is valid (and not near-expiry), calls next().
 * When the token is expired and a refresh token is present, attempts silent refresh.
 * On any auth failure, returns HTTP 200 with a JSON-RPC -32001 error body so ChatGPT
 * can display the message to the user rather than showing a generic HTTP error.
 */

import type { MiddlewareHandler, Context } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { getSession, getSessionId, setSession, destroySession } from "../auth/cookie.js";
import { refreshAccessToken, OAuthError } from "../auth/linkedin.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the JSON-RPC `id` from a pre-parsed request body.
 * Returns null for notifications or if the body is not JSON-RPC.
 */
type McpContext = Context<{ Bindings: HttpBindings; Variables: { parsedBody: unknown } }>;

function requestId(c: McpContext): string | number | null {
  const body = c.get("parsedBody") as Record<string, unknown> | undefined;
  if (!body) return null;
  const id = body["id"];
  if (typeof id === "string" || typeof id === "number") return id;
  return null;
}

/** Build a JSON-RPC -32001 auth error response (HTTP 200 so ChatGPT reads the body). */
function mcpAuthError(c: McpContext, id: string | number | null): Response {
  return c.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32001,
        message: `Authentication required. Please sign in at ${config.SERVER_URL}/auth/login to use LinkedIn tools.`,
      },
    },
    200,
  );
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const requireAuth: MiddlewareHandler<{ Bindings: HttpBindings; Variables: { parsedBody: unknown } }> = async (c, next) => {
  const session = getSession(c);
  const id = requestId(c);

  // 1. No session or no access token
  if (!session || !session.accessToken) {
    return mcpAuthError(c, id);
  }

  // 2. Check expiry with 60-second buffer
  const nearExpiry = session.expiresAt < Date.now() + 60_000;

  if (nearExpiry) {
    if (session.refreshToken) {
      // 3a. Attempt silent refresh
      try {
        const updated = await refreshAccessToken(session.refreshToken);
        const sessionId = getSessionId(c);

        const merged = {
          ...session,
          accessToken: updated.accessToken,
          expiresAt: updated.expiresAt,
          // Keep old refresh token if LinkedIn did not return a new one
          ...(updated.refreshToken !== undefined
            ? { refreshToken: updated.refreshToken }
            : {}),
        };

        if (sessionId) {
          setSession(c, sessionId, merged);
        }
        await next();
        return;
      } catch (err) {
        if (err instanceof OAuthError) {
          console.error("[auth] token refresh failed:", err.code);
        }
        destroySession(c);
        return mcpAuthError(c, id);
      }
    } else {
      // 3b. No refresh token available — LinkedIn may not issue one for this app tier
      console.info(
        "[auth] Access token expired; no refresh token available — re-auth required",
      );
      destroySession(c);
      return mcpAuthError(c, id);
    }
  }

  // 4. Token is valid and not near-expiry
  await next();
  return;
};
