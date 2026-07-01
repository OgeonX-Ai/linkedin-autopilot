/**
 * Minimal HS256 JWT implementation using Node built-in crypto.
 * Used to issue access tokens to ChatGPT after LinkedIn OAuth completes.
 */

import crypto from "node:crypto";
import { config } from "../config.js";

interface JwtPayload {
  sub: string;       // sessionId
  iat: number;
  exp: number;
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signJwt(sessionId: string, ttlSeconds = 3600): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ sub: sessionId, iat: now, exp: now + ttlSeconds }));
  const sig = base64url(
    crypto.createHmac("sha256", config.SESSION_SECRET).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = base64url(
    crypto.createHmac("sha256", config.SESSION_SECRET).update(`${header}.${payload}`).digest(),
  );
  if (expected.length !== sig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64").toString()) as JwtPayload;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
