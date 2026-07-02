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

interface PendingAuthRequest {
  redirectUri: string;
  chatgptState: string;
  expiresAt: number;
  codeChallenge?: string;
}

interface AuthorizationCodeEntry {
  sessionId: string;
  expiresAt: number;
  codeChallenge?: string;
}

// Pending client auth requests: authReqId → callback state + optional PKCE challenge.
export const pendingAuthRequests = new Map<string, PendingAuthRequest>();

// Short-lived auth codes issued after LinkedIn callback: code → session + PKCE challenge.
export const authCodes = new Map<string, AuthorizationCodeEntry>();

// Purge stale pending requests and expired auth codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingAuthRequests) {
    if (req.expiresAt < now) pendingAuthRequests.delete(id);
  }
  for (const [code, entry] of authCodes) {
    if (entry.expiresAt < now) authCodes.delete(code);
  }
}, 5 * 60 * 1000).unref();

/**
 * GET /oauth/authorize
 * ChatGPT redirects users here. We chain into LinkedIn OAuth.
 */
// Trusted redirect_uri prefixes for the ChatGPT / Claude OAuth AS flow.
// Any redirect_uri presented at /oauth/authorize must start with one of these.
// Add your AI platform's callback base URL to ALLOWED_ORIGINS (env var) or hardcode here.
const TRUSTED_REDIRECT_ORIGINS = [
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://claude.ai",
];

export function isTrustedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.hash || parsed.username || parsed.password) return false;

    // RFC 8252 loopback redirects use an ephemeral local port. Codex uses 127.0.0.1.
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
    if (parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname)) {
      return true;
    }

    if (parsed.protocol !== "https:") return false;
    const origin = parsed.origin;
    if (TRUSTED_REDIRECT_ORIGINS.some((t) => origin === t)) return true;
    if (config.allowedOrigins?.some((o) => origin === o)) return true;
    return false;
  } catch {
    return false;
  }
}

export function verifyPkceCodeChallenge(
  codeVerifier: string,
  expectedChallenge: string,
): boolean {
  const actualChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");
  const actual = Buffer.from(actualChallenge, "ascii");
  const expected = Buffer.from(expectedChallenge, "ascii");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

oauthRoutes.get("/authorize", (c) => {
  const redirectUri = c.req.query("redirect_uri") ?? "";
  const chatgptState = c.req.query("state") ?? "";
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");

  if (!redirectUri) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri required" }, 400);
  }

  // Validate redirect_uri against trusted origins to prevent open-redirect abuse
  if (!isTrustedRedirectUri(redirectUri)) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri is not allowed" }, 400);
  }

  const isLoopbackRedirect = new URL(redirectUri).protocol === "http:";
  if (isLoopbackRedirect && (!codeChallenge || codeChallengeMethod !== "S256")) {
    return c.json({ error: "invalid_request", error_description: "S256 PKCE is required for loopback redirects" }, 400);
  }
  if (codeChallenge && (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))) {
    return c.json({ error: "invalid_request", error_description: "Invalid PKCE code challenge" }, 400);
  }

  // Store the ChatGPT request so we can complete it after LinkedIn callback (10-min TTL)
  const authReqId = crypto.randomUUID();
  pendingAuthRequests.set(authReqId, {
    redirectUri,
    chatgptState,
    expiresAt: Date.now() + 10 * 60 * 1000,
    ...(codeChallenge ? { codeChallenge } : {}),
  });

  // Encode authReqId into the LinkedIn state so the callback can retrieve it
  const linkedinState = generateState() + "." + authReqId;

  // Build LinkedIn auth URL using /oauth/callback as redirect (separate from /auth/callback)
  const oauthCallbackUri = `${config.SERVER_URL}/oauth/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.LINKEDIN_CLIENT_ID,
    redirect_uri: oauthCallbackUri,
    scope: config.linkedinOauthScopes.join(" "),
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
    authCodes.set(authCode, {
      sessionId,
      expiresAt: Date.now() + 5 * 60 * 1000,
      ...(pending.codeChallenge ? { codeChallenge: pending.codeChallenge } : {}),
    });

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
  const codeVerifier = body["code_verifier"];

  if (grantType !== "authorization_code" || !code) {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const pending = authCodes.get(code);
  if (!pending || pending.expiresAt < Date.now()) {
    authCodes.delete(code);
    return c.json({ error: "invalid_grant" }, 400);
  }
  authCodes.delete(code);

  if (
    pending.codeChallenge &&
    (!codeVerifier || !verifyPkceCodeChallenge(codeVerifier, pending.codeChallenge))
  ) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  const jwt = signJwt(pending.sessionId, 3600);
  return c.json({
    access_token: jwt,
    token_type: "Bearer",
    expires_in: 3600,
  });
});
