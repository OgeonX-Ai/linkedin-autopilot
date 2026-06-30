/**
 * Session types and server-side in-memory session store.
 * Tokens are NEVER sent to the MCP client — they live here only.
 */

export interface SessionData {
  /** LinkedIn access token (server-side only — never sent to ChatGPT) */
  accessToken: string;
  /** LinkedIn refresh token — LinkedIn may not issue one for this app tier */
  refreshToken?: string;
  /** Unix ms: Date.now() + expires_in * 1000 */
  expiresAt: number;
  /** "sub" claim from LinkedIn userinfo (urn:li:person base sub value) */
  linkedinSub: string;
  /** Ephemeral CSRF token; deleted (set to undefined) after callback validates it */
  oauthState?: string;
}

/**
 * Server-side in-memory session store (MVP).
 * Key: sessionId (crypto.randomUUID())
 * Value: SessionData
 *
 * Replace with Redis or SQLite for production / multi-process deployments.
 */
export const sessionStore = new Map<string, SessionData>();
