import { describe, it, expect, vi } from "vitest";

// Mock config before importing jwt so config.SESSION_SECRET is set
vi.mock("../config.js", () => ({
  config: { SESSION_SECRET: "test-secret-value-that-is-at-least-32-chars" },
}));

import { signJwt, verifyJwt } from "./jwt.js";

describe("signJwt()", () => {
  it("produces a three-part dot-separated token", () => {
    const token = signJwt("session-123");
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("produces a token that verifyJwt() accepts", () => {
    const token = signJwt("session-abc");
    const claims = verifyJwt(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe("session-abc");
  });

  it("encodes iat and exp in the payload", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signJwt("sess-1", 3600);
    const after = Math.floor(Date.now() / 1000);
    const claims = verifyJwt(token);
    expect(claims).not.toBeNull();
    expect(claims!.iat).toBeGreaterThanOrEqual(before);
    expect(claims!.iat).toBeLessThanOrEqual(after);
    expect(claims!.exp).toBeGreaterThanOrEqual(before + 3600);
  });
});

describe("verifyJwt()", () => {
  it("returns claims for a valid token", () => {
    const token = signJwt("valid-session");
    const claims = verifyJwt(token);
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe("valid-session");
  });

  it("returns null for an expired token", () => {
    // TTL of -1 second means it expired in the past
    const token = signJwt("expired-session", -1);
    const result = verifyJwt(token);
    expect(result).toBeNull();
  });

  it("returns null for a tampered payload", () => {
    const token = signJwt("session-tamper");
    const [header, , sig] = token.split(".");
    // Replace payload with a tampered one (different sub)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", iat: 0, exp: 9999999999 })
    )
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const tampered = `${header}.${tamperedPayload}.${sig}`;
    expect(verifyJwt(tampered)).toBeNull();
  });

  it("returns null for a token with wrong number of parts", () => {
    expect(verifyJwt("onlyone")).toBeNull();
    expect(verifyJwt("two.parts")).toBeNull();
  });

  it("returns null for a completely invalid token string", () => {
    expect(verifyJwt("not.a.valid.jwt.token")).toBeNull();
  });
});
