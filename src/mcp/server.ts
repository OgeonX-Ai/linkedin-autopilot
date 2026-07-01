import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProfileHandler } from "../tools/get-profile.js";
import { postUpdateHandler } from "../tools/post-update.js";
import { getRecentCommitsHandler } from "../tools/get-recent-commits.js";
import { postAINewsHandler } from "../tools/post-ai-news.js";
import { postArticleHandler } from "../tools/post-article.js";
import { postThoughtLeadershipHandler } from "../tools/post-thought-leadership.js";
import { postWeeklyRoundupHandler } from "../tools/post-weekly-roundup.js";
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

  server.tool(
    "getRecentCommits",
    "Get recent git commits from a local repository. Returns commit messages, authors, dates, and changed files. Use this to compose a LinkedIn post about what you've been building.",
    {
      repoPath: z
        .string()
        .optional()
        .describe("Absolute path to the git repository (defaults to the MCP server's working directory)"),
      count: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of recent commits to fetch (1–20, default 5)"),
    },
    async ({ repoPath, count }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = session.accessToken !== undefined ? { accessToken: session.accessToken } : {};
      return getRecentCommitsHandler({ repoPath, count }, sessionArg);
    },
  );

  server.tool(
    "postAINews",
    "Fetch a trending AI news headline from public RSS feeds and post it to LinkedIn automatically. No parameters needed — picks the most recent story and composes a professional post.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      };
      return postAINewsHandler({}, sessionArg);
    },
  );

  server.tool(
    "postThoughtLeadership",
    "Post a thought-leadership insight about AI trends to LinkedIn. Fetches a recent news item for context and composes an opinion-style post with a closing question to drive comments.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      };
      return postThoughtLeadershipHandler({}, sessionArg);
    },
  );

  server.tool(
    "postWeeklyRoundup",
    "Post a weekly AI news roundup to LinkedIn — curates top 5 stories from multiple sources into a save-worthy summary post. Best posted on Fridays.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      };
      return postWeeklyRoundupHandler({}, sessionArg);
    },
  );

  server.tool(
    "postArticle",
    "Post a long-form article to LinkedIn. Provide a title and body — the server formats it with hashtags and posts it. Articles live permanently on the profile and are indexed by Google.",
    {
      title: z.string().min(1).max(150).describe("Article headline"),
      body: z.string().min(50).max(2800).describe("Article body text"),
      topic: z.string().optional().describe("Topic hint for hashtags: ai, tech, startup, or future"),
    },
    async ({ title, body, topic }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      };
      return postArticleHandler({ title, body, topic }, sessionArg);
    },
  );

  return server;
}
