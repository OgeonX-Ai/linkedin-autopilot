/**
 * OAuth 2.0 Authorization Server endpoints for ChatGPT.
 *
 * ChatGPT uses these to authenticate users before making MCP tool calls.
 * Flow:
 *   1. ChatGPT → GET /oauth/authorize?...  (we redirect user to LinkedIn)
 *   2. LinkedIn → GET /auth/callback        (we store code, redirect ChatGPT)
 *   3. ChatGPT → POST /oauth/token          (we return a signed JWT)
 *   4. ChatGPT → POST /mcp (Bearer JWT)     (requireAuth resolves session)
 */

import { Hono } from "hono";
import crypto from "node:crypto";
import { exchangeCode, generateState, OAuthError } from "../auth/linkedin.js";
import { sessionStore } from "../auth/session.js";
import { signJwt } from "../auth/jwt.js";
import { saveSessions } from "../auth/session-persist.js";
import { config } from "../config.js";

export const oauthRoutes = new Hono();

// Pending ChatGPT auth requests: authReqId → { redirectUri, state, codeVerifier? }
export const pendingAuthRequests = new Map<string, { redirectUri: string; chatgptState: string }>();

// Short-lived auth codes issued after LinkedIn callback: code → sessionId
export const authCodes = new Map<string, { sessionId: string; expiresAt: number }>();

/**
 * GET /oauth/authorize
 * ChatGPT redirects users here. We chain into LinkedIn OAuth.
 */
oauthRoutes.get("/authorize", (c) => {
  const redirectUri = c.req.query("redirect_uri") ?? "";
  const chatgptState = c.req.query("state") ?? "";

  if (!redirectUri) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri required" }, 400);
  }

  // Store the ChatGPT request so we can complete it after LinkedIn callback
  const authReqId = crypto.randomUUID();
  pendingAuthRequests.set(authReqId, { redirectUri, chatgptState });

  // Encode authReqId into the LinkedIn state so the callback can retrieve it
  const linkedinState = generateState() + "." + authReqId;

  // Build LinkedIn auth URL using /oauth/callback as redirect (separate from /auth/callback)
  const oauthCallbackUri = `${config.SERVER_URL}/oauth/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.LINKEDIN_CLIENT_ID,
    redirect_uri: oauthCallbackUri,
    scope: "openid profile email w_member_social w_organization_social r_organization_social rw_organization_admin",
    state: linkedinState,
  });
  const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

  return c.redirect(linkedinAuthUrl, 302);
});

/**
 * GET /oauth/callback
 * LinkedIn redirects here (alternative to /auth/callback) when initiated via /oauth/authorize.
 * Extracts authReqId from state, completes token exchange, issues code to ChatGPT.
 */
oauthRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const incomingState = c.req.query("state") ?? "";
  const errorParam = c.req.query("error");

  if (errorParam) {
    return c.json({ error: "access_denied" }, 400);
  }

  // State format: <linkedinRandom>.<authReqId>
  const dotIdx = incomingState.lastIndexOf(".");
  if (dotIdx === -1 || !code) {
    return c.json({ error: "invalid_state" }, 400);
  }

  const authReqId = incomingState.slice(dotIdx + 1);
  const pending = pendingAuthRequests.get(authReqId);
  if (!pending) {
    return c.json({ error: "invalid_state", error_description: "Unknown auth request" }, 400);
  }
  pendingAuthRequests.delete(authReqId);

  try {
    const oauthCallbackUri = `${config.SERVER_URL}/oauth/callback`;
    const tokens = await exchangeCode(code, oauthCallbackUri);
    const sessionId = crypto.randomUUID();
    sessionStore.set(sessionId, {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      linkedinSub: tokens.linkedinSub,
      ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    });
    saveSessions(); // persist immediately so restarts don't lose the session

    // Issue a short-lived code to ChatGPT
    const authCode = crypto.randomBytes(32).toString("hex");
    authCodes.set(authCode, { sessionId, expiresAt: Date.now() + 5 * 60 * 1000 });

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set("code", authCode);
    redirectUrl.searchParams.set("state", pending.chatgptState);
    return c.redirect(redirectUrl.toString(), 302);
  } catch (err) {
    const code = err instanceof OAuthError ? err.code : "server_error";
    console.error("[oauth] callback failed:", code);
    return c.json({ error: "server_error" }, 502);
  }
});

/**
 * POST /oauth/token
 * ChatGPT exchanges the auth code for a JWT access token.
 */
oauthRoutes.post("/token", async (c) => {
  let body: Record<string, string>;
  try {
    const text = await c.req.text();
    body = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const grantType = body["grant_type"];
  const code = body["code"];

  if (grantType !== "authorization_code" || !code) {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const pending = authCodes.get(code);
  if (!pending || pending.expiresAt < Date.now()) {
    authCodes.delete(code);
    return c.json({ error: "invalid_grant" }, 400);
  }
  authCodes.delete(code);

  const jwt = signJwt(pending.sessionId, 3600);
  return c.json({
    access_token: jwt,
    token_type: "Bearer",
    expires_in: 3600,
  });
});
