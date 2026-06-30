import { z } from "zod";

const envSchema = z.object({
  LINKEDIN_CLIENT_ID: z.string().min(1, "LINKEDIN_CLIENT_ID is required"),
  LINKEDIN_CLIENT_SECRET: z.string().min(1, "LINKEDIN_CLIENT_SECRET is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (use a random secret)"),
  PORT: z
    .string()
    .optional()
    .default("3000")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(65535)),
  ALLOWED_ORIGINS: z
    .string()
    .min(1, "ALLOWED_ORIGINS is required (comma-separated list of allowed origins)")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    ),
  SERVER_URL: z
    .string()
    .url("SERVER_URL must be a valid URL (e.g. https://your-ngrok-url.ngrok.io)"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.flatten().fieldErrors;
  const lines = Object.entries(errors)
    .map(([field, msgs]) => `  ${field}: ${(msgs ?? []).join(", ")}`)
    .join("\n");
  console.error(
    `[config] Server startup failed — missing or invalid environment variables:\n${lines}`
  );
  console.error(
    `[config] Copy .env.example to .env and fill in the required values.`
  );
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
