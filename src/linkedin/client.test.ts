import { describe, it, expect, vi, beforeEach } from "vitest";
import { LinkedInClient, LinkedInApiError, linkedinFetch, LINKEDIN_VERSION } from "./client.js";

// Mock global fetch
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers[key] ?? headers[key.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as unknown as Response;
}

describe("LinkedInClient.getProfile", () => {
  let client: LinkedInClient;

  beforeEach(() => {
    client = new LinkedInClient();
    vi.clearAllMocks();
  });

  it("returns profile fields on 200", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        sub: "abc123",
        name: "Kim Harjamäki",
        email: "kim@example.com",
        headline: "Engineer",
      }),
    );
    const profile = await client.getProfile("token");
    expect(profile).toEqual({
      sub: "abc123",
      name: "Kim Harjamäki",
      email: "kim@example.com",
      headline: "Engineer",
    });
  });

  it("returns empty headline when absent", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { sub: "x", name: "X", email: "x@x.com" }),
    );
    const profile = await client.getProfile("token");
    expect(profile.headline).toBe("");
  });

  it("throws LinkedInApiError with 401 message on 401", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(401, {}));
    await expect(client.getProfile("bad")).rejects.toMatchObject({
      name: "LinkedInApiError",
      httpStatus: 401,
      message: "Not authenticated. Please reconnect your LinkedIn account.",
    });
  });

  it("throws LinkedInApiError with 403 message on 403", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, {}));
    await expect(client.getProfile("token")).rejects.toMatchObject({
      httpStatus: 403,
      message: "Permission denied. Check your LinkedIn app scopes.",
    });
  });

  it("throws LinkedInApiError with 429 message on 429", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(429, {}));
    await expect(client.getProfile("token")).rejects.toMatchObject({
      httpStatus: 429,
      message: "LinkedIn rate limit exceeded. Please wait a moment and try again.",
    });
  });

  it("throws LinkedInApiError with 5xx message on 503", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(503, {}));
    await expect(client.getProfile("token")).rejects.toMatchObject({
      httpStatus: 503,
      message: "LinkedIn service error (HTTP 503). Try again later.",
    });
  });

  it("throws LinkedInApiError on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    await expect(client.getProfile("token")).rejects.toMatchObject({
      httpStatus: null,
      message: "Could not reach LinkedIn. Check your internet connection.",
    });
  });
});

describe("LinkedInClient.createPost", () => {
  let client: LinkedInClient;

  beforeEach(() => {
    client = new LinkedInClient();
    vi.clearAllMocks();
  });

  it("returns postId and postUrl from x-linkedin-id header on 201", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(201, {}, { "x-linkedin-id": "urn:li:share:123" }),
    );
    const post = await client.createPost("token", "urn:li:person:abc", "Hello");
    expect(post.postId).toBe("urn:li:share:123");
    expect(post.postUrl).toBe("https://www.linkedin.com/feed/update/urn:li:share:123/");
  });

  it("throws LinkedInApiError on 401", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(401, {}));
    await expect(
      client.createPost("bad", "urn:li:person:abc", "Hello"),
    ).rejects.toMatchObject({
      httpStatus: 401,
      message: "Not authenticated. Please reconnect your LinkedIn account.",
    });
  });

  it("throws LinkedInApiError on 429", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(429, {}));
    await expect(
      client.createPost("token", "urn:li:person:abc", "Hello"),
    ).rejects.toMatchObject({
      httpStatus: 429,
      message: "LinkedIn rate limit exceeded. Please wait a moment and try again.",
    });
  });

  it("throws LinkedInApiError on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    await expect(
      client.createPost("token", "urn:li:person:abc", "Hello"),
    ).rejects.toMatchObject({
      httpStatus: null,
      message: "Could not reach LinkedIn. Check your internet connection.",
    });
  });
});

// ── linkedinFetch() header enforcement (SEC-04) ──────────────────────────────

describe("linkedinFetch()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets Authorization header to 'Bearer <token>'", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
    await linkedinFetch("https://api.linkedin.com/v2/userinfo", "test-token");
    const calledHeaders = mockFetch.mock.calls[0]![1]?.headers as Headers;
    expect(calledHeaders.get("Authorization")).toBe("Bearer test-token");
  });

  it("sets LinkedIn-Version header to '202304'", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
    await linkedinFetch("https://api.linkedin.com/v2/userinfo", "test-token");
    const calledHeaders = mockFetch.mock.calls[0]![1]?.headers as Headers;
    expect(calledHeaders.get("LinkedIn-Version")).toBe(LINKEDIN_VERSION);
  });

  it("sets X-Restli-Protocol-Version header to '2.0.0'", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
    await linkedinFetch("https://api.linkedin.com/v2/userinfo", "test-token");
    const calledHeaders = mockFetch.mock.calls[0]![1]?.headers as Headers;
    expect(calledHeaders.get("X-Restli-Protocol-Version")).toBe("2.0.0");
  });

  it("enforced Authorization header wins over caller-supplied value", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
    await linkedinFetch("https://api.linkedin.com/v2/userinfo", "test-token", {
      headers: { Authorization: "Bearer other-value" },
    });
    const calledHeaders = mockFetch.mock.calls[0]![1]?.headers as Headers;
    expect(calledHeaders.get("Authorization")).toBe("Bearer test-token");
  });

  it("passes non-header options (method, body) through to fetch", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(201, {}));
    await linkedinFetch("https://api.linkedin.com/v2/ugcPosts", "test-token", {
      method: "POST",
      body: JSON.stringify({ text: "Hello" }),
    });
    const calledOptions = mockFetch.mock.calls[0]![1];
    expect(calledOptions?.method).toBe("POST");
    expect(calledOptions?.body).toBe(JSON.stringify({ text: "Hello" }));
  });

  it("propagates network errors without swallowing them", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    await expect(
      linkedinFetch("https://api.linkedin.com/v2/userinfo", "test-token")
    ).rejects.toThrow("network down");
  });
});
