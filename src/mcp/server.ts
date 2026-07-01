import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProfileHandler } from "../tools/get-profile.js";
import { postUpdateHandler } from "../tools/post-update.js";
import { sessionStore } from "../auth/session.js";
import type { SessionData } from "../auth/session.js";

/**
 * Build an MCP server wired to the real LinkedIn tool handlers.
 *
 * sessionId is resolved at call time (not at server build time) from the
 * server-side session store, so the accessToken and linkedinSub values are
 * always current (T-04-04: sub comes from server-side session, not from args).
 */
export function buildMcpServer(sessionId: string = ""): McpServer {
  const server = new McpServer({
    name: "linkedin-mcp",
    version: "1.0.0",
  });

  server.tool(
    "getProfile",
    "Fetch the authenticated user's LinkedIn profile: name, email, headline, and LinkedIn ID.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = session.accessToken !== undefined
        ? { accessToken: session.accessToken }
        : {};
      return getProfileHandler({}, sessionArg);
    },
  );

  server.tool(
    "postUpdate",
    "Post a text update to LinkedIn on behalf of the authenticated user. Returns the post ID and URL.",
    {
      text: z
        .string()
        .min(1, "Post text cannot be empty")
        .max(3000, "Post text cannot exceed LinkedIn's 3000-character limit")
        .describe("The text content of the LinkedIn post (1–3000 characters)"),
    },
    async ({ text }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      };
      return postUpdateHandler({ text }, sessionArg);
    },
  );

  return server;
}
