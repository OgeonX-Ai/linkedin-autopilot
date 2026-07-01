/**
 * User registry — persists LinkedIn user records across server restarts.
 * Key: linkedinSub (stable LinkedIn person ID)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface UserRecord {
  linkedinSub: string;
  name: string;
  email: string;
  sessionId: string;
  createdAt: number;
  lastActiveAt: number;
}

const userRegistry = new Map<string, UserRecord>();

const USERS_FILE = path.join(process.cwd(), ".users.json");

export function registerUser(
  sub: string,
  name: string,
  email: string,
  sessionId: string,
): UserRecord {
  const existing = userRegistry.get(sub);
  const record: UserRecord = {
    linkedinSub: sub,
    name,
    email,
    sessionId,
    createdAt: existing?.createdAt ?? Date.now(),
    lastActiveAt: Date.now(),
  };
  userRegistry.set(sub, record);
  return record;
}

export function getUser(sub: string): UserRecord | undefined {
  return userRegistry.get(sub);
}

export function getAllUsers(): UserRecord[] {
  return [...userRegistry.values()];
}

export function saveUserRegistry(): void {
  try {
    const entries = [...userRegistry.entries()];
    writeFileSync(USERS_FILE, JSON.stringify(entries, null, 2), "utf8");
  } catch (err) {
    console.warn(
      "[users] Could not save .users.json:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function loadUserRegistry(): void {
  if (!existsSync(USERS_FILE)) return;
  try {
    const raw = readFileSync(USERS_FILE, "utf8");
    const entries = JSON.parse(raw) as [string, UserRecord][];
    for (const [sub, record] of entries) {
      userRegistry.set(sub, record);
    }
    console.info(`[users] Loaded ${userRegistry.size} user(s) from disk`);
  } catch {
    console.warn("[users] Could not load .users.json — starting fresh");
  }
}
