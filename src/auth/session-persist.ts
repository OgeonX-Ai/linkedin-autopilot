/**
 * Simple file-based session persistence.
 * Saves the session store to .sessions.json on write, loads it on startup.
 * Only persists sessions that have real LinkedIn tokens (not CSRF-only entries).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { sessionStore } from "./session.js";
import type { SessionData } from "./session.js";

const SESSIONS_FILE = path.join(process.cwd(), ".sessions.json");

/** Load persisted sessions from disk into the in-memory store. */
export function loadSessions(): void {
  if (!existsSync(SESSIONS_FILE)) return;
  try {
    const raw = readFileSync(SESSIONS_FILE, "utf8");
    const entries = JSON.parse(raw) as [string, SessionData][];
    const now = Date.now();
    for (const [id, data] of entries) {
      // Skip sessions whose access token has expired (refresh token may still be valid)
      if (data.expiresAt > 0 && data.expiresAt < now && !data.refreshToken) continue;
      sessionStore.set(id, data);
    }
    console.info(`[sessions] Loaded ${sessionStore.size} session(s) from disk`);
  } catch {
    console.warn("[sessions] Could not load .sessions.json — starting fresh");
  }
}

/** Persist all sessions with real tokens to disk. */
export function saveSessions(): void {
  try {
    const entries = [...sessionStore.entries()].filter(
      ([, data]) => data.accessToken && data.expiresAt > 0,
    );
    writeFileSync(SESSIONS_FILE, JSON.stringify(entries, null, 2), "utf8");
  } catch (err) {
    console.warn("[sessions] Could not save sessions:", err instanceof Error ? err.message : err);
  }
}
