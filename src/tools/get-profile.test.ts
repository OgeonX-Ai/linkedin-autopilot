import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProfileHandler } from "./get-profile.js";

// Hoisted mock — must use vi.hoisted for top-level mutable bindings
const mockGetProfile = vi.fn();

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
    getProfile = mockGetProfile;
  }
  return { LinkedInClient, LinkedInApiError };
});

describe("getProfileHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth error when no accessToken in session", async () => {
    const result = await getProfileHandler({}, {});
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toContain("/auth/login");
  });

  it("returns formatted profile on success", async () => {
    mockGetProfile.mockResolvedValueOnce({
      sub: "abc123",
      name: "Kim Harjamäki",
      email: "kim@example.com",
      headline: "Engineer",
    });
    const result = await getProfileHandler({}, { accessToken: "tok" });
    expect(result.isError).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toContain("Name: Kim Harjamäki");
    expect(text).toContain("Email: kim@example.com");
    expect(text).toContain("Headline: Engineer");
    expect(text).toContain("LinkedIn ID: abc123");
  });

  it("returns isError:true with error message on LinkedInApiError", async () => {
    const { LinkedInApiError } = await import("../linkedin/client.js");
    mockGetProfile.mockRejectedValueOnce(
      new LinkedInApiError(401, "Not authenticated. Please reconnect your LinkedIn account."),
    );
    const result = await getProfileHandler({}, { accessToken: "tok" });
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result.content[0]!.text).toBe(
      "Not authenticated. Please reconnect your LinkedIn account.",
    );
  });

  it("returns generic error message on unexpected error — no stack trace", async () => {
    mockGetProfile.mockRejectedValueOnce(new Error("boom"));
    const result = await getProfileHandler({}, { accessToken: "tok" });
    expect(result.isError).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const text = result.content[0]!.text;
    expect(text).toBe("An unexpected error occurred.");
    expect(text).not.toContain(" at ");
  });
});
