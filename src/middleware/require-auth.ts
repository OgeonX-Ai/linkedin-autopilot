/**
 * requireAuth — gates MCP tool calls behind a valid LinkedIn session.
 *
 * Accepts two auth methods:
 *   1. Bearer JWT in Authorization header (ChatGPT / OAuth AS flow)
 *   2. Signed session cookie (browser-based flow)
 *
 * On expiry, attempts silent refresh if refresh token is available.
 * Returns JSON-RPC -32001 (HTTP 200) so ChatGPT shows the message to the user.
 */

import type { MiddlewareHandler, Context } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { getSession, getSessionId, setSession, destroySession } from "../auth/cookie.js";
import { refreshAccessToken, OAuthError } from "../auth/linkedin.js";
import { verifyJwt } from "../auth/jwt.js";
import { sessionStore } from "../auth/session.js";
import type { SessionData } from "../auth/session.js";
import { config } from "../config.js";

type McpContext = Context<{ Bindings: HttpBindings; Variables: { parsedBody: unknown } }>;

function requestId(c: McpContext): string | number | null {
  const body = c.get("parsedBody") as Record<string, unknown> | undefined;
  if (!body) return null;
  const id = body["id"];
  if (typeof id === "string" || typeof id === "number") return id;
  return null;
}

function mcpAuthError(c: McpContext, id: string | number | null): Response {
  return c.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32001,
        message: `Authentication required. Visit ${config.SERVER_URL}/oauth/authorize to connect LinkedIn.`,
      },
    },
    200,
  );
}

/** Resolve session from Bearer JWT or session cookie. Returns [session, sessionId]. */
function resolveSession(c: McpContext): [SessionData | undefined, string | null] {
  // 1. Try Bearer JWT (ChatGPT / OAuth AS flow)
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const claims = verifyJwt(token);
    if (claims) {
      const session = sessionStore.get(claims.sub);
      return [session, claims.sub];
    }
  }

  // 2. Fall back to session cookie (browser flow)
  return [getSession(c), getSessionId(c)];
}

export const requireAuth: MiddlewareHandler<{ Bindings: HttpBindings; Variables: { parsedBody: unknown } }> = async (c, next) => {
  const [session, sessionId] = resolveSession(c);
  const id = requestId(c);

  if (!session || !session.accessToken) {
    return mcpAuthError(c, id);
  }

  const nearExpiry = session.expiresAt < Date.now() + 60_000;

  if (nearExpiry) {
    if (session.refreshToken) {
      try {
        const updated = await refreshAccessToken(session.refreshToken);
        const merged = {
          ...session,
          accessToken: updated.accessToken,
          expiresAt: updated.expiresAt,
          ...(updated.refreshToken !== undefined ? { refreshToken: updated.refreshToken } : {}),
        };
        if (sessionId) {
          sessionStore.set(sessionId, merged);
          setSession(c, sessionId, merged);
        }
        await next();
        return;
      } catch (err) {
        if (err instanceof OAuthError) console.error("[auth] token refresh failed:", err.code);
        if (sessionId) sessionStore.delete(sessionId);
        destroySession(c);
        return mcpAuthError(c, id);
      }
    } else {
      console.info("[auth] Access token expired; no refresh token — re-auth required");
      if (sessionId) sessionStore.delete(sessionId);
      destroySession(c);
      return mcpAuthError(c, id);
    }
  }

  await next();
  return;
};
