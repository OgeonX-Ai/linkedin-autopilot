import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { sanitizeSecret, sanitizeErrors } from "./sanitize-errors.js";

// ── sanitizeSecret pure helper ───────────────────────────────────────────────

describe("sanitizeSecret()", () => {
  test("replaces a single occurrence of the secret", () => {
    expect(sanitizeSecret("token=abc123 error", "abc123")).toBe(
      "token=[REDACTED] error"
    );
  });

  test("replaces multiple occurrences of the secret", () => {
    expect(sanitizeSecret("abc123 and abc123 again", "abc123")).toBe(
      "[REDACTED] and [REDACTED] again"
    );
  });

  test("returns input unchanged when secret is empty string", () => {
    expect(sanitizeSecret("some message", "")).toBe("some message");
  });

  test("handles regex special characters in the secret (e.g. 'a.b$c')", () => {
    const secret = "a.b$c";
    const input = `error: ${secret} leaked`;
    expect(sanitizeSecret(input, secret)).toBe("error: [REDACTED] leaked");
  });

  test("does not replace partial matches", () => {
    // 'abc' should not replace 'abcdef'
    expect(sanitizeSecret("value=abcdef", "abc")).toBe("value=[REDACTED]def");
  });
});

// ── sanitizeErrors Hono error handler ────────────────────────────────────────

// Minimal mock of Hono Context
function makeContext(jsonFn = vi.fn()) {
  return {
    json: jsonFn,
  };
}

describe("sanitizeErrors()", () => {
  const originalEnv = process.env.LINKEDIN_CLIENT_SECRET;

  beforeEach(() => {
    process.env.LINKEDIN_CLIENT_SECRET = "super-secret-value";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LINKEDIN_CLIENT_SECRET;
    } else {
      process.env.LINKEDIN_CLIENT_SECRET = originalEnv;
    }
    vi.restoreAllMocks();
  });

  test("redacts the client secret from err.message in the response body", () => {
    const jsonFn = vi.fn().mockReturnValue(new Response());
    const ctx = makeContext(jsonFn);
    const err = new Error("super-secret-value");

    sanitizeErrors(err, ctx as never);

    expect(jsonFn).toHaveBeenCalledWith(
      { error: "[REDACTED]" },
      expect.any(Number)
    );
    const body = jsonFn.mock.calls[0]![0] as { error: string };
    expect(body.error).not.toContain("super-secret-value");
  });

  test("defaults to status 500 when err has no status", () => {
    const jsonFn = vi.fn().mockReturnValue(new Response());
    const ctx = makeContext(jsonFn);
    const err = new Error("some error");

    sanitizeErrors(err, ctx as never);

    expect(jsonFn).toHaveBeenCalledWith(expect.anything(), 500);
  });

  test("uses err.status when provided", () => {
    const jsonFn = vi.fn().mockReturnValue(new Response());
    const ctx = makeContext(jsonFn);
    const err = Object.assign(new Error("not found"), { status: 404 });

    sanitizeErrors(err, ctx as never);

    expect(jsonFn).toHaveBeenCalledWith(expect.anything(), 404);
  });

  test("sanitizes err.stack before logging", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const jsonFn = vi.fn().mockReturnValue(new Response());
    const ctx = makeContext(jsonFn);
    const err = new Error("some error");
    err.stack = `Error: super-secret-value\n    at test.ts:1:1`;

    sanitizeErrors(err, ctx as never);

    const logged = consoleSpy.mock.calls[0]?.[0] as string;
    expect(logged).not.toContain("super-secret-value");
    expect(logged).toContain("[REDACTED]");
  });

  test("response body { error } does not contain raw secret", () => {
    const jsonFn = vi.fn().mockReturnValue(new Response());
    const ctx = makeContext(jsonFn);
    const err = new Error("token super-secret-value was rejected");

    sanitizeErrors(err, ctx as never);

    const body = jsonFn.mock.calls[0]![0] as { error: string };
    expect(body.error).not.toContain("super-secret-value");
    expect(body.error).toContain("[REDACTED]");
  });
});
