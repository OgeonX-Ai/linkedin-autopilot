import { describe, it, expect, vi, beforeEach } from "vitest";
import { postUpdateHandler } from "./post-update.js";

const mockCreatePost = vi.fn();

vi.mock("../linkedin/client.js", () => {
  class LinkedInApiError extends Error {
    httpStatus: number | null;
    constructor(httpStatus: number | null, message: string) {
      super(message);
      this.name = "LinkedInApiError";
      this.httpStatus = httpStatus;
    }
  }
  class LinkedInClient {
    createPost = mockCreatePost;
  }
  return { LinkedInClient, LinkedInApiError };
});

// Never touch disk from a handler test — post-history.ts persists to a real file.
vi.mock("../analytics/post-history.js", () => ({
  recordPost: vi.fn(),
}));

describe("postUpdateHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validSession = { accessToken: "tok", linkedinSub: "abc123" };

  it("returns auth error when no accessToken", async () => {
    const result = await postUpdateHandler({ text: "hello" }, {});
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("/auth/login");
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it("returns auth error when no linkedinSub", async () => {
    const result = await postUpdateHandler({ text: "hello" }, { accessToken: "tok" });
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("/auth/login");
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it("returns validation error for empty text — no API call", async () => {
    const result = await postUpdateHandler({ text: "" }, validSession);
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toBe("Post text cannot be empty.");
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it("returns validation error for undefined text — no API call", async () => {
    const result = await postUpdateHandler({}, validSession);
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toBe("Post text cannot be empty.");
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it("returns validation error for 3001-char text — no API call", async () => {
    const text = "a".repeat(3001);
    const result = await postUpdateHandler({ text }, validSession);
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const msg = result.content[0]!.text;
    expect(msg).toContain("3000-character limit");
    expect(msg).toContain("3001");
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it("succeeds with exactly 3000-char text — API call is made", async () => {
    const text = "a".repeat(3000);
    mockCreatePost.mockResolvedValueOnce({
      postId: "urn:li:share:999",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:999/",
    });
    const result = await postUpdateHandler({ text }, validSession);
    expect(result.isError).toBe(false);
    expect(mockCreatePost).toHaveBeenCalledOnce();
    expect(mockCreatePost).toHaveBeenCalledWith("tok", "urn:li:person:abc123", text);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("Post created successfully.");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("urn:li:share:999");
  });

  it("returns isError:true on LinkedInApiError", async () => {
    const { LinkedInApiError } = await import("../linkedin/client.js");
    mockCreatePost.mockRejectedValueOnce(
      new LinkedInApiError(
        401,
        "Not authenticated. Please reconnect your LinkedIn account.",
      ),
    );
    const result = await postUpdateHandler({ text: "hello" }, validSession);
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toBe(
      "Not authenticated. Please reconnect your LinkedIn account.",
    );
  });

  it("returns success with post ID and URL", async () => {
    mockCreatePost.mockResolvedValueOnce({
      postId: "urn:li:share:42",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:42/",
    });
    const result = await postUpdateHandler({ text: "Test post" }, validSession);
    expect(result.isError).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("Post ID: urn:li:share:42");
    expect(text).toContain("URL: https://www.linkedin.com/feed/update/urn:li:share:42/");
  });
});
