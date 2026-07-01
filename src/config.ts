import { z } from "zod";

// Config type with camelCase properties (as spec'd in SEC-01)
export interface Config {
  sessionSecret: string;
  linkedinClientId: string;
  linkedinClientSecret: string;
  linkedinRedirectUri: string;
  port: number;
  allowedOrigins: string[];
  serverUrl: string;
  // Uppercase aliases kept for backward compatibility with existing callers
  SESSION_SECRET: string;
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  LINKEDIN_REDIRECT_URI: string;
  PORT: number;
  ALLOWED_ORIGINS: string[];
  SERVER_URL: string;
}

export function validateConfig(): Config {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required");
  }
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }

  const linkedinClientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!linkedinClientSecret) {
    throw new Error("LINKEDIN_CLIENT_SECRET is required");
  }

  const linkedinClientId = process.env.LINKEDIN_CLIENT_ID;
  if (!linkedinClientId) {
    throw new Error("LINKEDIN_CLIENT_ID is required");
  }

  const linkedinRedirectUri =
    process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:3000/auth/callback";

  const port = parseInt(process.env.PORT ?? "3000", 10);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const serverUrl = process.env.SERVER_URL ?? "";

  return {
    // camelCase (spec)
    sessionSecret,
    linkedinClientId,
    linkedinClientSecret,
    linkedinRedirectUri,
    port,
    allowedOrigins,
    serverUrl,
    // UPPER_SNAKE_CASE aliases (backward compat with existing callers)
    SESSION_SECRET: sessionSecret,
    LINKEDIN_CLIENT_ID: linkedinClientId,
    LINKEDIN_CLIENT_SECRET: linkedinClientSecret,
    LINKEDIN_REDIRECT_URI: linkedinRedirectUri,
    PORT: port,
    ALLOWED_ORIGINS: allowedOrigins,
    SERVER_URL: serverUrl,
  };
}

function initConfig(): Config {
  try {
    const cfg = validateConfig();
    console.log("Security checks passed — all required env vars present and valid");
    return cfg;
  } catch (err) {
    process.stderr.write((err as Error).message + "\n");
    process.exit(1);
  }
}

// Only run at module load when not in a test environment.
// Tests import validateConfig() directly and call it with their own process.env setup.
const isTest =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST != null ||
  process.env.NODE_TEST_CONTEXT != null;

// eslint-disable-next-line prefer-const
let config: Config = isTest ? ({} as Config) : initConfig();

export { config };
