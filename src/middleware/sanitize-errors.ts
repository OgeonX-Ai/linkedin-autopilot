import type { ErrorHandler } from "hono";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeSecret(input: string, secret: string): string {
  if (!secret) return input;
  const re = new RegExp(escapeRegex(secret), "g");
  return input.replace(re, "[REDACTED]");
}

export const sanitizeErrors: ErrorHandler = (err, c) => {
  const secret = process.env.LINKEDIN_CLIENT_SECRET ?? "";
  const rawMessage = err.message ?? "Internal server error";
  const sanitizedMessage = sanitizeSecret(rawMessage, secret);

  if (err.stack) {
    const sanitizedStack = sanitizeSecret(err.stack, secret);
    console.error(sanitizedStack);
  }

  const status = (err as { status?: number }).status ?? 500;
  return c.json({ error: sanitizedMessage }, status as 200);
};
