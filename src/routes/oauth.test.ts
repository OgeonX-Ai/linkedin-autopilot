import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    allowedOrigins: ["https://chatgpt.com"],
    LINKEDIN_CLIENT_ID: "linkedin-client-id",
    linkedinOauthScopes: ["openid", "profile", "email", "w_member_social"],
    SERVER_URL: "https://mcp.example.com",
    SESSION_SECRET: "test-session-secret-that-is-at-least-32-characters",
  },
}));

import {
  authCodes,
  isTrustedRedirectUri,
  oauthRoutes,
  pendingAuthRequests,
  verifyPkceCodeChallenge,
} from "./oauth.js";

describe("Codex OAuth compatibility", () => {
  beforeEach(() => {
    pendingAuthRequests.clear();
    authCodes.clear();
  });

  it("allows loopback callback URLs used by Codex", () => {
    expect(
      isTrustedRedirectUri("http://127.0.0.1:60616/callback/session-id"),
    ).toBe(true);
    expect(
      isTrustedRedirectUri("http://localhost:60616/callback/session-id"),
    ).toBe(true);
  });

  it("rejects non-loopback HTTP callbacks and deceptive hostnames", () => {
    expect(isTrustedRedirectUri("http://example.com/callback")).toBe(false);
    expect(isTrustedRedirectUri("http://127.0.0.1.evil.test/callback")).toBe(false);
    expect(isTrustedRedirectUri("http://localhost.evil.test/callback")).toBe(false);
  });

  it("verifies an S256 PKCE code verifier", () => {
    const verifier = "codex-verifier-that-is-long-enough-for-pkce-1234567890";
    const challenge = "ZVow-1JTw2MT0EgA95LXz2IG074qDBdiXYSRcfkNj7w";

    expect(verifyPkceCodeChallenge(verifier, challenge)).toBe(true);
    expect(verifyPkceCodeChallenge("wrong-verifier", challenge)).toBe(false);
  });

  it("accepts a Codex authorization request and retains its PKCE challenge", async () => {
    const challenge = "ZVow-1JTw2MT0EgA95LXz2IG074qDBdiXYSRcfkNj7w";
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "codex-cli",
      state: "codex-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: "http://127.0.0.1:60616/callback/session-id",
    });

    const response = await oauthRoutes.request(`/authorize?${query}`);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/,
    );
    expect([...pendingAuthRequests.values()]).toEqual([
      expect.objectContaining({
        redirectUri: "http://127.0.0.1:60616/callback/session-id",
        chatgptState: "codex-state",
        codeChallenge: challenge,
      }),
    ]);
  });

  it("requires S256 PKCE for loopback authorization requests", async () => {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "codex-cli",
      state: "codex-state",
      redirect_uri: "http://127.0.0.1:60616/callback/session-id",
    });

    const response = await oauthRoutes.request(`/authorize?${query}`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
      error_description: "S256 PKCE is required for loopback redirects",
    });
  });

  it("exchanges an authorization code only with the matching verifier", async () => {
    const verifier = "codex-verifier-that-is-long-enough-for-pkce-1234567890";
    const challenge = "ZVow-1JTw2MT0EgA95LXz2IG074qDBdiXYSRcfkNj7w";
    authCodes.set("valid-code", {
      sessionId: "session-id",
      expiresAt: Date.now() + 60_000,
      codeChallenge: challenge,
    });

    const response = await oauthRoutes.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "valid-code",
        code_verifier: verifier,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        token_type: "Bearer",
        expires_in: 3600,
        access_token: expect.any(String),
      }),
    );
  });
});
