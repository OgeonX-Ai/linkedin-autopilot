import { describe, test, afterEach, expect } from "vitest";

// Import only validateConfig — the module-level side effect is guarded by NODE_TEST_CONTEXT
import { validateConfig } from "./config.js";

const VALID_ENV = {
  SESSION_SECRET: "a".repeat(32),
  LINKEDIN_CLIENT_SECRET: "test-secret",
  LINKEDIN_CLIENT_ID: "test-client-id",
  LINKEDIN_REDIRECT_URI: "http://localhost:3000/auth/callback",
  PORT: "3000",
  ALLOWED_ORIGINS: "http://localhost:3000",
  SERVER_URL: "http://localhost:3000",
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries(VALID_ENV)) {
    process.env[k] = v;
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearEnv() {
  for (const k of Object.keys(VALID_ENV)) {
    delete process.env[k];
  }
}

afterEach(() => {
  clearEnv();
});

describe("validateConfig()", () => {
  test("throws when SESSION_SECRET is absent", () => {
    setEnv({ SESSION_SECRET: undefined });
    expect(() => validateConfig()).toThrow("SESSION_SECRET is required");
  });

  test("throws when SESSION_SECRET is empty string", () => {
    setEnv({ SESSION_SECRET: "" });
    expect(() => validateConfig()).toThrow("SESSION_SECRET is required");
  });

  test("throws when SESSION_SECRET is shorter than 32 characters", () => {
    setEnv({ SESSION_SECRET: "tooshort" });
    expect(() => validateConfig()).toThrow(
      "SESSION_SECRET must be at least 32 characters"
    );
  });

  test("throws when SESSION_SECRET is exactly 31 characters", () => {
    setEnv({ SESSION_SECRET: "a".repeat(31) });
    expect(() => validateConfig()).toThrow(
      "SESSION_SECRET must be at least 32 characters"
    );
  });

  test("throws when LINKEDIN_CLIENT_SECRET is absent", () => {
    setEnv({ LINKEDIN_CLIENT_SECRET: undefined });
    expect(() => validateConfig()).toThrow("LINKEDIN_CLIENT_SECRET is required");
  });

  test("throws when LINKEDIN_CLIENT_ID is absent", () => {
    setEnv({ LINKEDIN_CLIENT_ID: undefined });
    expect(() => validateConfig()).toThrow("LINKEDIN_CLIENT_ID is required");
  });

  test("succeeds with SESSION_SECRET exactly 32 characters", () => {
    setEnv({ SESSION_SECRET: "a".repeat(32) });
    const cfg = validateConfig();
    expect(cfg.sessionSecret).toBe("a".repeat(32));
    expect(cfg.SESSION_SECRET).toBe("a".repeat(32));
  });

  test("succeeds with SESSION_SECRET of 64 characters", () => {
    setEnv({ SESSION_SECRET: "b".repeat(64) });
    const cfg = validateConfig();
    expect(cfg.sessionSecret).toHaveLength(64);
  });

  test("returned config has correct shape", () => {
    setEnv({});
    const cfg = validateConfig();
    expect(typeof cfg.sessionSecret).toBe("string");
    expect(typeof cfg.linkedinClientId).toBe("string");
    expect(typeof cfg.linkedinClientSecret).toBe("string");
    expect(typeof cfg.linkedinRedirectUri).toBe("string");
    expect(typeof cfg.port).toBe("number");
  });

  test("port defaults to 3000 when PORT is not set", () => {
    setEnv({ PORT: undefined });
    const cfg = validateConfig();
    expect(cfg.port).toBe(3000);
    expect(cfg.PORT).toBe(3000);
  });

  test("organization scopes are opt-in", () => {
    setEnv({ LINKEDIN_OAUTH_SCOPES: undefined });
    expect(validateConfig().linkedinOauthScopes).toEqual([
      "openid",
      "profile",
      "email",
      "w_member_social",
    ]);

    setEnv({
      LINKEDIN_OAUTH_SCOPES:
        "openid profile email w_member_social w_organization_social",
    });
    expect(validateConfig().linkedinOauthScopes).toContain(
      "w_organization_social",
    );
  });

  test("error message for short SESSION_SECRET does not contain the secret value", () => {
    const shortSecret = "short-but-visible-value-here";
    setEnv({ SESSION_SECRET: shortSecret });
    let message = "";
    try {
      validateConfig();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain(shortSecret);
  });
});
