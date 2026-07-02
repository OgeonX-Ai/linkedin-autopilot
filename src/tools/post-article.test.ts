import { describe, it, expect, vi, beforeEach } from "vitest";
import { postArticleHandler } from "./post-article.js";

const mockCreatePost = vi.fn();
const mockCreateArticlePost = vi.fn();

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
    createArticlePost = mockCreateArticlePost;
  }
  return { LinkedInClient, LinkedInApiError };
});

describe("postArticleHandler()", () => {
  const validSession = { accessToken: "tok", linkedinSub: "abc123" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth error when no accessToken", async () => {
    const result = await postArticleHandler(
      { title: "Hello", body: "World" },
      {},
    );
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("/auth/login");
    expect(mockCreatePost).not.toHaveBeenCalled();
    expect(mockCreateArticlePost).not.toHaveBeenCalled();
  });

  it("returns auth error when accessToken present but no linkedinSub or orgId", async () => {
    const result = await postArticleHandler(
      { title: "Hello", body: "World" },
      { accessToken: "tok" },
    );
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("/auth/login");
  });

  it("returns validation error when title is missing", async () => {
    const result = await postArticleHandler({ body: "Some body text" }, validSession);
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("title and body are required");
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  it("returns validation error when body is missing", async () => {
    const result = await postArticleHandler({ title: "My Title" }, validSession);
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("title and body are required");
  });

  it("calls createPost (not createArticlePost) when no sourceUrl given", async () => {
    mockCreatePost.mockResolvedValueOnce({
      postId: "urn:li:share:1",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:1/",
    });

    const result = await postArticleHandler(
      { title: "My Article", body: "The full article body content here." },
      validSession,
    );

    expect(result.isError).toBe(false);
    expect(mockCreatePost).toHaveBeenCalledOnce();
    expect(mockCreateArticlePost).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("Article posted to LinkedIn");
    expect(text).toContain("My Article");
    expect(text).toContain("urn:li:share:1");
  });

  it("calls createArticlePost (not createPost) when sourceUrl is given", async () => {
    mockCreateArticlePost.mockResolvedValueOnce({
      postId: "urn:li:share:2",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:2/",
    });

    const result = await postArticleHandler(
      {
        title: "External Article",
        body: "Summary of the article.",
        sourceUrl: "https://example.com/article",
      },
      validSession,
    );

    expect(result.isError).toBe(false);
    expect(mockCreateArticlePost).toHaveBeenCalledOnce();
    expect(mockCreatePost).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("Article posted to LinkedIn");
    expect(text).toContain("urn:li:share:2");
  });

  it("passes the correct authorUrn (person) to createPost", async () => {
    mockCreatePost.mockResolvedValueOnce({
      postId: "urn:li:share:3",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:3/",
    });

    await postArticleHandler(
      { title: "Title", body: "Body text" },
      { accessToken: "tok", linkedinSub: "person999" },
    );

    expect(mockCreatePost).toHaveBeenCalledWith(
      "tok",
      "urn:li:person:person999",
      expect.any(String),
    );
  });

  it("passes the correct authorUrn (organization) when orgId is set", async () => {
    mockCreatePost.mockResolvedValueOnce({
      postId: "urn:li:share:4",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:4/",
    });

    await postArticleHandler(
      { title: "Org Post", body: "Content" },
      { accessToken: "tok", orgId: "org777" },
    );

    expect(mockCreatePost).toHaveBeenCalledWith(
      "tok",
      "urn:li:organization:org777",
      expect.any(String),
    );
  });

  it("returns isError:true on LinkedInApiError", async () => {
    const { LinkedInApiError } = await import("../linkedin/client.js");
    mockCreatePost.mockRejectedValueOnce(
      new LinkedInApiError(403, "Forbidden: insufficient permissions"),
    );

    const result = await postArticleHandler(
      { title: "Test", body: "Content" },
      validSession,
    );

    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toBe("Forbidden: insufficient permissions");
  });

  it("returns generic error message on unexpected error", async () => {
    mockCreatePost.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await postArticleHandler(
      { title: "Test", body: "Content" },
      validSession,
    );

    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toBe("Unexpected error posting article.");
  });
});
