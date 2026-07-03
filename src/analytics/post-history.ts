/**
 * Post history — records every post the autopilot actually publishes to LinkedIn.
 * File-backed like session-persist.ts / user-registry.ts (no database).
 *
 * This intentionally does NOT track reach/engagement/follower counts: the
 * LinkedIn API scopes this server is approved for (w_member_social,
 * rw_organization_admin) do not expose post-level analytics. What we can
 * verify is what we ourselves published — so that's what gets recorded.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type PostType =
  | "postUpdate"
  | "postAINews"
  | "postThoughtLeadership"
  | "postWeeklyRoundup"
  | "postArticle";

export interface PostRecord {
  id: string;
  type: PostType;
  target: "personal" | "company";
  ownerSub: string | undefined;
  postedAt: number;
  textPreview: string;
  linkedinPostId: string;
  linkedinPostUrl: string;
}

const HISTORY_FILE = path.join(process.cwd(), ".post-history.json");
const MAX_RECORDS = 500;
const PREVIEW_LENGTH = 140;

let history: PostRecord[] = [];

/** Load persisted post history from disk into memory. */
export function loadPostHistory(): void {
  if (!existsSync(HISTORY_FILE)) return;
  try {
    const raw = readFileSync(HISTORY_FILE, "utf8");
    history = JSON.parse(raw) as PostRecord[];
    console.info(`[post-history] Loaded ${history.length} post record(s) from disk`);
  } catch {
    console.warn("[post-history] Could not load .post-history.json — starting fresh");
  }
}

function savePostHistory(): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
  } catch (err) {
    console.warn(
      "[post-history] Could not save .post-history.json:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Record a successful LinkedIn post. Persists immediately (posts are infrequent). */
export function recordPost(entry: {
  type: PostType;
  target: "personal" | "company";
  ownerSub: string | undefined;
  text: string;
  linkedinPostId: string;
  linkedinPostUrl: string;
}): PostRecord {
  const record: PostRecord = {
    id: crypto.randomUUID(),
    type: entry.type,
    target: entry.target,
    ownerSub: entry.ownerSub,
    postedAt: Date.now(),
    textPreview:
      entry.text.length > PREVIEW_LENGTH
        ? `${entry.text.slice(0, PREVIEW_LENGTH)}…`
        : entry.text,
    linkedinPostId: entry.linkedinPostId,
    linkedinPostUrl: entry.linkedinPostUrl,
  };

  history.push(record);
  if (history.length > MAX_RECORDS) {
    history = history.slice(history.length - MAX_RECORDS);
  }
  savePostHistory();
  return record;
}

/** All post records for a given owner (or all records if ownerSub is undefined), newest first. */
export function getPostHistory(ownerSub?: string): PostRecord[] {
  const scoped = ownerSub ? history.filter((r) => r.ownerSub === ownerSub) : history;
  // Reverse before the stable sort so posts recorded in the same millisecond
  // still come back most-recently-recorded first, not insertion order.
  return [...scoped].reverse().sort((a, b) => b.postedAt - a.postedAt);
}

export interface PostStats {
  totalPosts: number;
  postsThisWeek: number;
  postsByType: Record<PostType, number>;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Aggregate stats for a given owner (or all records if ownerSub is undefined). */
export function getPostStats(ownerSub?: string): PostStats {
  const scoped = getPostHistory(ownerSub);
  const now = Date.now();
  const postsByType: Record<PostType, number> = {
    postUpdate: 0,
    postAINews: 0,
    postThoughtLeadership: 0,
    postWeeklyRoundup: 0,
    postArticle: 0,
  };
  let postsThisWeek = 0;
  for (const record of scoped) {
    postsByType[record.type] += 1;
    if (now - record.postedAt <= WEEK_MS) postsThisWeek += 1;
  }
  return { totalPosts: scoped.length, postsThisWeek, postsByType };
}

/** Test-only: reset in-memory state without touching disk. */
export function __resetPostHistoryForTests(): void {
  history = [];
}
