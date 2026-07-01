/**
 * Auth routes: GET /auth/login, GET /auth/callback, GET /auth/logout
 *
 * These routes are UNAUTHENTICATED — requireAuth must NOT be applied here.
 * They implement the two-leg OAuth flow:
 *   Leg 1: server → LinkedIn (obtain tokens server-side)
 *   Leg 2: session cookie → ChatGPT/MCP client (session reference only)
 */

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import {
  buildAuthUrl,
  exchangeCode,
  generateState,
  OAuthError,
} from "../auth/linkedin.js";
import {
  getSession,
  getSessionId,
  setSession,
  destroySession,
} from "../auth/cookie.js";
import { sessionStore } from "../auth/session.js";
import { registerUser, saveUserRegistry } from "../auth/user-registry.js";
import crypto from "node:crypto";

export const authRoutes = new Hono();

/**
 * GET /auth/login — Initiate LinkedIn OAuth authorization code flow.
 * Generates a CSRF state token, stores it in a fresh session, redirects to LinkedIn.
 */
authRoutes.get("/login", async (c) => {
  const state = generateState();
  const sessionId = crypto.randomUUID();

  // Bootstrap a minimal session entry to hold the CSRF state.
  // We store oauthState only (no tokens yet — those arrive after callback).
  // Cast: SessionData requires accessToken but we fill it after callback.
  // We store only the state value using sessionStore directly here.
  sessionStore.set(sessionId, {
    accessToken: "",
    expiresAt: 0,
    linkedinSub: "",
    oauthState: state,
  });

  const signed = (await import("../auth/cookie.js")).signSessionId(sessionId);
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  c.header(
    "Set-Cookie",
    `sid=${encodeURIComponent(signed)}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=604800`,
  );

  console.info("[auth] OAuth login initiated");
  return c.redirect(buildAuthUrl(state), 302);
});

/**
 * GET /auth/callback — LinkedIn redirects here after user consent.
 * Validates CSRF state, exchanges code for tokens, stores session.
 *
 * Security: SEC-03 — state comparison uses timingSafeEqual (not ===).
 * Tokens never appear in response bodies, logs, or redirect URLs.
 */
authRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const incomingState = c.req.query("state") ?? "";
  const errorParam = c.req.query("error");

  if (errorParam) {
    return c.json({ error: "oauth_error", detail: errorParam }, 400);
  }

  // Load session
  const session = getSession(c);
  if (!session) {
    return c.json({ error: "no_session" }, 400);
  }

  // Timing-safe CSRF state comparison (SEC-03)
  const storedState = session.oauthState ?? "";
  const storedBuf = Buffer.from(storedState, "utf8");
  const incomingBuf = Buffer.from(incomingState, "utf8");

  const stateValid =
    storedBuf.length > 0 &&
    storedBuf.length === incomingBuf.length &&
    timingSafeEqual(storedBuf, incomingBuf);

  if (!stateValid) {
    destroySession(c);
    return c.json({ error: "invalid_state" }, 400);
  }

  if (!code) {
    destroySession(c);
    return c.json({ error: "missing_code" }, 400);
  }

  const sessionId = getSessionId(c);

  try {
    const tokens = await exchangeCode(code);

    // Rebuild session without oauthState (consumed — single use, SEC-03)
    const { oauthState: _consumed, ...sessionWithoutState } = session;
    void _consumed; // suppress unused-variable warning

    const updatedSession = {
      ...sessionWithoutState,
      ...tokens,
    };

    if (sessionId) {
      setSession(c, sessionId, updatedSession);
      // Register / update user record
      registerUser(
        tokens.linkedinSub,
        tokens.linkedinName ?? "",
        tokens.linkedinEmail ?? "",
        sessionId,
      );
      saveUserRegistry();
    }

    return c.json({ ok: true, sub: tokens.linkedinSub });
  } catch (err) {
    if (err instanceof OAuthError) {
      // Log only the error code — never log err.message (may contain token data)
      console.error("[auth] token exchange failed:", err.code);
      return c.json(
        { error: "token_exchange_failed", detail: err.code },
        502,
      );
    }
    console.error("[auth] unexpected error during token exchange");
    return c.json({ error: "internal_error" }, 500);
  }
});

/**
 * GET /auth/logout — Destroy the session and clear the session cookie.
 */
authRoutes.get("/logout", (c) => {
  destroySession(c);
  console.info("[auth] Session destroyed");
  return c.json({ ok: true });
});
