/**
 * Session cookie signing and verification using HMAC-SHA256.
 * Cookie value format: `${sessionId}.${hmac(sessionId, SESSION_SECRET)}`
 */

import crypto from "node:crypto";
import { config } from "../config.js";
import type { Context } from "hono";
import { sessionStore } from "./session.js";
import type { SessionData } from "./session.js";

/** Sign a raw session ID to produce the cookie value. */
export function signSessionId(id: string): string {
  const hmac = crypto.createHmac("sha256", config.SESSION_SECRET);
  hmac.update(id);
  return `${id}.${hmac.digest("hex")}`;
}

/**
 * Verify a signed session cookie value.
 * Returns the raw session ID if signature is valid, or null if tampered.
 */
export function verifySessionId(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;

  const id = signed.slice(0, dot);
  const expected = signSessionId(id);

  if (expected.length !== signed.length) return null;

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signed, "utf8"),
      Buffer.from(expected, "utf8"),
    )
  ) {
    return null;
  }

  return id;
}

/** Read the `sid` cookie from a Hono context and verify its signature. */
function getRawSessionId(c: Context): string | null {
  const cookieHeader = c.req.header("cookie");
  if (!cookieHeader) return null;

  const match = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader);
  if (!match || !match[1]) return null;

  return verifySessionId(decodeURIComponent(match[1]));
}

/** Retrieve the current session data, or undefined if missing / invalid. */
export function getSession(c: Context): SessionData | undefined {
  const id = getRawSessionId(c);
  if (!id) return undefined;
  return sessionStore.get(id);
}

/** Retrieve the current session ID from cookie (verified), or null. */
export function getSessionId(c: Context): string | null {
  return getRawSessionId(c);
}

/**
 * Persist session data and set the signed `sid` cookie on the response.
 * Cookie flags: HttpOnly, SameSite=Lax, Secure in production, Max-Age=7 days.
 */
export function setSession(c: Context, id: string, data: SessionData): void {
  sessionStore.set(id, data);

  const signed = signSessionId(id);
  const secure =
    process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  c.header(
    "Set-Cookie",
    `sid=${encodeURIComponent(signed)}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=604800`,
  );
}

/** Destroy the session: remove from store and clear the cookie. */
export function destroySession(c: Context): void {
  const id = getRawSessionId(c);
  if (id) {
    sessionStore.delete(id);
  }
  c.header(
    "Set-Cookie",
    "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
}
