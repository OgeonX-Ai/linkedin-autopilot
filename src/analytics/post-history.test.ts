import { describe, it, expect, beforeEach, vi } from "vitest";

// Never touch disk from a unit test — post-history.ts persists to a real file.
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

import {
  recordPost,
  getPostHistory,
  getPostStats,
  __resetPostHistoryForTests,
} from "./post-history.js";

describe("post-history", () => {
  beforeEach(() => {
    __resetPostHistoryForTests();
  });

  it("records a post and returns it from getPostHistory", () => {
    const record = recordPost({
      type: "postUpdate",
      target: "personal",
      ownerSub: "user-1",
      text: "hello world",
      linkedinPostId: "urn:li:share:1",
      linkedinPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:1/",
    });

    const history = getPostHistory("user-1");
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(record);
    expect(record.textPreview).toBe("hello world");
  });

  it("truncates long text into a preview", () => {
    const text = "a".repeat(200);
    const record = recordPost({
      type: "postArticle",
      target: "personal",
      ownerSub: "user-1",
      text,
      linkedinPostId: "urn:li:share:2",
      linkedinPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:2/",
    });
    expect(record.textPreview).toHaveLength(141);
    expect(record.textPreview.endsWith("…")).toBe(true);
  });

  it("scopes history to the given ownerSub", () => {
    recordPost({
      type: "postUpdate",
      target: "personal",
      ownerSub: "user-1",
      text: "a",
      linkedinPostId: "1",
      linkedinPostUrl: "u1",
    });
    recordPost({
      type: "postUpdate",
      target: "personal",
      ownerSub: "user-2",
      text: "b",
      linkedinPostId: "2",
      linkedinPostUrl: "u2",
    });

    expect(getPostHistory("user-1")).toHaveLength(1);
    expect(getPostHistory("user-2")).toHaveLength(1);
    expect(getPostHistory()).toHaveLength(2);
  });

  it("returns newest first", () => {
    recordPost({
      type: "postUpdate",
      target: "personal",
      ownerSub: "user-1",
      text: "first",
      linkedinPostId: "1",
      linkedinPostUrl: "u1",
    });
    recordPost({
      type: "postUpdate",
      target: "personal",
      ownerSub: "user-1",
      text: "second",
      linkedinPostId: "2",
      linkedinPostUrl: "u2",
    });

    const history = getPostHistory("user-1");
    expect(history[0]?.textPreview).toBe("second");
    expect(history[1]?.textPreview).toBe("first");
  });

  it("computes stats scoped to owner", () => {
    recordPost({
      type: "postAINews",
      target: "personal",
      ownerSub: "user-1",
      text: "a",
      linkedinPostId: "1",
      linkedinPostUrl: "u1",
    });
    recordPost({
      type: "postAINews",
      target: "company",
      ownerSub: "user-1",
      text: "b",
      linkedinPostId: "2",
      linkedinPostUrl: "u2",
    });
    recordPost({
      type: "postUpdate",
      target: "personal",
      ownerSub: "user-2",
      text: "c",
      linkedinPostId: "3",
      linkedinPostUrl: "u3",
    });

    const stats = getPostStats("user-1");
    expect(stats.totalPosts).toBe(2);
    expect(stats.postsThisWeek).toBe(2);
    expect(stats.postsByType.postAINews).toBe(2);
    expect(stats.postsByType.postUpdate).toBe(0);
  });

  it("returns zeroed stats when there is no history", () => {
    const stats = getPostStats("nobody");
    expect(stats.totalPosts).toBe(0);
    expect(stats.postsThisWeek).toBe(0);
    expect(Object.values(stats.postsByType).every((n) => n === 0)).toBe(true);
  });
});
