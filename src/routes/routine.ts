/**
 * Simple HTTP endpoints for scheduled Claude routines.
 * A routine agent calls POST /routine/post-ai-news with a Bearer JWT
 * and the server does the rest — no MCP protocol overhead needed.
 */

import { Hono } from "hono";
import { verifyJwt, signJwt } from "../auth/jwt.js";
import { sessionStore } from "../auth/session.js";
import { getSession, getSessionId } from "../auth/cookie.js";
import { postAINewsHandler } from "../tools/post-ai-news.js";
import { postThoughtLeadershipHandler } from "../tools/post-thought-leadership.js";
import { postWeeklyRoundupHandler } from "../tools/post-weekly-roundup.js";
import { postArticleHandler } from "../tools/post-article.js";
import { searchJobsHandler } from "../tools/search-jobs.js";
import { updateCompanyPageHandler } from "../tools/update-company-page.js";
import { config } from "../config.js";
import crypto from "node:crypto";

export const routineRoutes = new Hono();

/** Resolve session from Bearer JWT or API key — shared by all routine endpoints. */
function resolveRoutineSession(authHeader: string | undefined): { accessToken?: string; linkedinSub?: string } | null {
  if (!authHeader) return null;

  // Bearer JWT (Claude routines / ChatGPT)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const claims = verifyJwt(token);
    if (claims) {
      const s = sessionStore.get(claims.sub);
      return s?.accessToken ? s : null;
    }

    // API key (Google Agentspace, Gemini, n8n, Zapier, etc.)
    if (config.apiKeys.length > 0) {
      const keyBuf = Buffer.from(token);
      const matched = config.apiKeys.some((k) => {
        const kb = Buffer.from(k);
        return kb.length === keyBuf.length && crypto.timingSafeEqual(kb, keyBuf);
      });
      if (matched) {
        for (const session of sessionStore.values()) {
          if (session.accessToken && session.expiresAt > Date.now()) return session;
        }
      }
    }
  }

  // X-API-Key header without a Bearer prefix: treat the raw key value as an API key
  // (callers normalise to "Bearer <key>" before calling, so this is a safety net)
  if (config.apiKeys.length > 0) {
    const rawKey = authHeader;
    const keyBuf = Buffer.from(rawKey);
    const matched = config.apiKeys.some((k) => {
      const kb = Buffer.from(k);
      return kb.length === keyBuf.length && crypto.timingSafeEqual(kb, keyBuf);
    });
    if (matched) {
      for (const session of sessionStore.values()) {
        if (session.accessToken && session.expiresAt > Date.now()) return session;
      }
    }
  }
  return null;
}

/**
 * GET /routine/token
 * After authenticating in the browser, visit this URL to get a 30-day JWT
 * that can be embedded in scheduled Claude routines.
 */
routineRoutes.get("/token", (c) => {
  const session = getSession(c);
  const sessionId = getSessionId(c);

  if (!session?.accessToken || !sessionId) {
    return c.json({
      error: "Not authenticated",
      hint: `Visit ${process.env["SERVER_URL"] ?? ""}/oauth/authorize first to connect LinkedIn`,
    }, 401);
  }

  // 30-day JWT — long enough for scheduled routines, short enough to be revocable
  const jwt = signJwt(sessionId, 30 * 24 * 60 * 60);
  return c.json({
    token: jwt,
    expires_in_days: 30,
    linkedinSub: session.linkedinSub,
    linkedinName: session.linkedinName ?? null,
    usage: `Add this as Authorization: Bearer <token> when calling /routine/post-ai-news`,
  });
});

/** POST /routine/post-ai-news — daily AI headline post */
routineRoutes.post("/post-ai-news", async (c) => {
  const authHeader = c.req.header("authorization") ?? (c.req.header("x-api-key") ? `Bearer ${c.req.header("x-api-key")}` : undefined);
  const session = resolveRoutineSession(authHeader);
  if (!session?.accessToken || !session.linkedinSub) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const result = await postAINewsHandler({}, {
    accessToken: session.accessToken,
    linkedinSub: session.linkedinSub,
  });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/post-thought-leadership — Wednesday engagement post */
routineRoutes.post("/post-thought-leadership", async (c) => {
  const authHeader = c.req.header("authorization") ?? (c.req.header("x-api-key") ? `Bearer ${c.req.header("x-api-key")}` : undefined);
  const session = resolveRoutineSession(authHeader);
  if (!session?.accessToken || !session.linkedinSub) return c.json({ error: "Unauthorized" }, 401);
  const result = await postThoughtLeadershipHandler({}, { accessToken: session.accessToken, linkedinSub: session.linkedinSub });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/post-weekly-roundup — Friday roundup */
routineRoutes.post("/post-weekly-roundup", async (c) => {
  const authHeader = c.req.header("authorization") ?? (c.req.header("x-api-key") ? `Bearer ${c.req.header("x-api-key")}` : undefined);
  const session = resolveRoutineSession(authHeader);
  if (!session?.accessToken || !session.linkedinSub) return c.json({ error: "Unauthorized" }, 401);
  const result = await postWeeklyRoundupHandler({}, { accessToken: session.accessToken, linkedinSub: session.linkedinSub });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/post-article — long-form article with optional URL preview */
routineRoutes.post("/post-article", async (c) => {
  const authHeader = c.req.header("authorization") ?? (c.req.header("x-api-key") ? `Bearer ${c.req.header("x-api-key")}` : undefined);
  const session = resolveRoutineSession(authHeader);
  if (!session?.accessToken || !session.linkedinSub) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const result = await postArticleHandler(
    { title: String(body["title"] ?? ""), body: String(body["body"] ?? ""), topic: body["topic"] as string | undefined, sourceUrl: body["sourceUrl"] as string | undefined },
    { accessToken: session.accessToken, linkedinSub: session.linkedinSub },
  );
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/search-jobs — find Finnish + remote jobs */
routineRoutes.post("/search-jobs", async (c) => {
  const authHeader = c.req.header("authorization") ?? (c.req.header("x-api-key") ? `Bearer ${c.req.header("x-api-key")}` : undefined);
  const session = resolveRoutineSession(authHeader);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const result = await searchJobsHandler(
    { keyword: body["keyword"] as string | undefined, location: body["location"] as string | undefined, remote: Boolean(body["remote"]) },
    { accessToken: session.accessToken },
  );
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/update-company-page — refresh OgeonX AI LinkedIn company page profile */
routineRoutes.post("/update-company-page", async (c) => {
  const authHeader = c.req.header("authorization") ?? (c.req.header("x-api-key") ? `Bearer ${c.req.header("x-api-key")}` : undefined);
  const session = resolveRoutineSession(authHeader);
  if (!session?.accessToken) return c.json({ error: "Unauthorized" }, 401);
  const result = await updateCompanyPageHandler({ accessToken: session.accessToken });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});
