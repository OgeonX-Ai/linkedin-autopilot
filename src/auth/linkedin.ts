/**
 * LinkedIn OAuth 2.0 / OIDC helper functions.
 *
 * Flow: standard authorization code grant with client_secret.
 * NO PKCE — LinkedIn does not enable PKCE by default for this app tier;
 * enabling it requires a LinkedIn support request (deferred to v2).
 *
 * Env vars are read at call time (not at module load) so tests can stub them.
 */

import { config } from "../config.js";
import crypto from "node:crypto";
import type { SessionData } from "./session.js";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

// ONLY these scopes — old scopes (r_liteprofile, r_emailaddress) return 401 immediately
const SCOPES = ["openid", "profile", "email", "w_member_social"] as const;

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

/**
 * Build the LinkedIn authorization URL for the authorization code flow.
 * No code_challenge / code_verifier (PKCE not enabled on this app).
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.LINKEDIN_CLIENT_ID,
    redirect_uri: config.LINKEDIN_REDIRECT_URI,
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface UserInfoResponse {
  sub: string;
  [key: string]: unknown;
}

/**
 * Exchange an authorization code for tokens, then fetch userinfo to get the sub.
 * Returns a complete SessionData object (without oauthState).
 *
 * Security: raw response bodies and client_secret are NEVER passed to any logger.
 */
export async function exchangeCode(
  code: string,
): Promise<Omit<SessionData, "oauthState">> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.LINKEDIN_REDIRECT_URI,
      client_id: config.LINKEDIN_CLIENT_ID,
      client_secret: config.LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    throw new OAuthError(
      "token_request_failed",
      "LinkedIn token request failed",
    );
  }

  const data = (await tokenRes.json()) as RawTokenResponse;

  // Fetch userinfo to obtain the stable LinkedIn sub
  const userInfoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new OAuthError("userinfo_failed", "LinkedIn userinfo request failed");
  }

  const userinfo = (await userInfoRes.json()) as UserInfoResponse;

  const result: Omit<SessionData, "oauthState"> = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    linkedinSub: userinfo["sub"],
  };

  // refreshToken is optional — LinkedIn may not issue one for this app tier
  if (data.refresh_token !== undefined) {
    result.refreshToken = data.refresh_token;
  }

  return result;
}

/**
 * Refresh an expired access token using a refresh token.
 *
 * NOTE: If LinkedIn does not return a new refresh_token in the response, the caller
 * MUST retain the existing refresh token. This function returns only the fields
 * that may have changed; merge with the existing session to preserve the old
 * refresh token when refreshToken is undefined in the return value.
 *
 * Security: raw response bodies and client_secret are NEVER passed to any logger.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<Pick<SessionData, "accessToken" | "refreshToken" | "expiresAt">> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.LINKEDIN_CLIENT_ID,
      client_secret: config.LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new OAuthError("refresh_failed", "LinkedIn token refresh failed");
  }

  const data = (await res.json()) as RawTokenResponse;

  const result: Pick<SessionData, "accessToken" | "refreshToken" | "expiresAt"> =
    {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

  if (data.refresh_token !== undefined) {
    result.refreshToken = data.refresh_token;
  }

  return result;
}

/**
 * Generate a cryptographically random CSRF state token (32 hex chars = 16 bytes).
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}
