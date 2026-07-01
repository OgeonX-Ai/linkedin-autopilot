/**
 * LinkedIn API client — wraps fetch with auth headers and error mapping.
 * All error messages use static strings (T-04-02: no raw response bodies or tokens exposed).
 */

/**
 * Enforced fetch helper for LinkedIn API calls.
 * Always sets Authorization, LinkedIn-Version, and X-Restli-Protocol-Version headers.
 * Caller-supplied values for these headers are overwritten (callers cannot bypass enforcement).
 * Network errors propagate as-is.
 */
export function linkedinFetch(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("LinkedIn-Version", LINKEDIN_VERSION);
  headers.set("X-Restli-Protocol-Version", "2.0.0");
  return fetch(url, { ...options, headers });
}

export class LinkedInApiError extends Error {
  constructor(
    public readonly httpStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

export const LINKEDIN_VERSION = "202304";

const LINKEDIN_ERROR_MESSAGES: Record<number, string> = {
  401: "Not authenticated. Please reconnect your LinkedIn account.",
  403: "Permission denied. Check your LinkedIn app scopes.",
  429: "LinkedIn rate limit exceeded. Please wait a moment and try again.",
};

function mapLinkedInError(status: number): string {
  if (LINKEDIN_ERROR_MESSAGES[status]) return LINKEDIN_ERROR_MESSAGES[status];
  if (status >= 500) return `LinkedIn service error (HTTP ${status}). Try again later.`;
  return `Unexpected LinkedIn API error (HTTP ${status}).`;
}

export interface LinkedInProfile {
  sub: string;
  name: string;
  email: string;
  headline: string;
}

export interface LinkedInPost {
  postId: string;
  postUrl: string;
}

export class LinkedInClient {
  private async request(
    url: string,
    accessToken: string,
    options: RequestInit = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await linkedinFetch(url, accessToken, options);
    } catch {
      throw new LinkedInApiError(
        null,
        "Could not reach LinkedIn. Check your internet connection.",
      );
    }
    if (!response.ok) {
      throw new LinkedInApiError(response.status, mapLinkedInError(response.status));
    }
    return response;
  }

  async getProfile(accessToken: string): Promise<LinkedInProfile> {
    const response = await this.request(
      "https://api.linkedin.com/v2/userinfo",
      accessToken,
      { method: "GET" },
    );
    const data = (await response.json()) as Record<string, unknown>;
    return {
      sub: String(data["sub"] ?? ""),
      name: String(data["name"] ?? ""),
      email: String(data["email"] ?? ""),
      headline: String(data["headline"] ?? ""),
    };
  }

  async createPost(
    accessToken: string,
    authorUrn: string,
    text: string,
  ): Promise<LinkedInPost> {
    const body = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const response = await this.request(
      "https://api.linkedin.com/v2/ugcPosts",
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    // LinkedIn 201: post URN is in the X-RestLi-Id response header
    const postId = response.headers.get("X-RestLi-Id") ?? "";
    const postUrl = `https://www.linkedin.com/feed/update/${postId}/`;
    return { postId, postUrl };
  }
}
