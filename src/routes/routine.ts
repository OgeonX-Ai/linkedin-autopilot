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

export const routineRoutes = new Hono();

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

routineRoutes.post("/post-ai-news", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const claims = verifyJwt(authHeader.slice(7));
  if (!claims) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const session = sessionStore.get(claims.sub);
  if (!session?.accessToken || !session.linkedinSub) {
    return c.json({ error: "No active LinkedIn session — please re-authenticate at /oauth/authorize" }, 401);
  }

  const result = await postAINewsHandler({}, {
    accessToken: session.accessToken,
    linkedinSub: session.linkedinSub,
  });

  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/post-thought-leadership — Wednesday engagement post */
routineRoutes.post("/post-thought-leadership", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const claims = verifyJwt(authHeader.slice(7));
  if (!claims) return c.json({ error: "Invalid or expired token" }, 401);
  const session = sessionStore.get(claims.sub);
  if (!session?.accessToken || !session.linkedinSub) return c.json({ error: "No active session" }, 401);
  const result = await postThoughtLeadershipHandler({}, { accessToken: session.accessToken, linkedinSub: session.linkedinSub });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});

/** POST /routine/post-weekly-roundup — Friday roundup */
routineRoutes.post("/post-weekly-roundup", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const claims = verifyJwt(authHeader.slice(7));
  if (!claims) return c.json({ error: "Invalid or expired token" }, 401);
  const session = sessionStore.get(claims.sub);
  if (!session?.accessToken || !session.linkedinSub) return c.json({ error: "No active session" }, 401);
  const result = await postWeeklyRoundupHandler({}, { accessToken: session.accessToken, linkedinSub: session.linkedinSub });
  return c.json({ ok: !result.isError, message: result.content[0]?.text ?? "" });
});
