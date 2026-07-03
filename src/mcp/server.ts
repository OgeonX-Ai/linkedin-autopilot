import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProfileHandler } from "../tools/get-profile.js";
import { postUpdateHandler } from "../tools/post-update.js";
import { getRecentCommitsHandler } from "../tools/get-recent-commits.js";
import { postAINewsHandler } from "../tools/post-ai-news.js";
import { postArticleHandler } from "../tools/post-article.js";
import { searchJobsHandler } from "../tools/search-jobs.js";
import { postThoughtLeadershipHandler } from "../tools/post-thought-leadership.js";
import { postWeeklyRoundupHandler } from "../tools/post-weekly-roundup.js";
import { updateCompanyPageHandler } from "../tools/update-company-page.js";
import { sessionStore } from "../auth/session.js";
import type { SessionData } from "../auth/session.js";
import { config } from "../config.js";

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
    "searchJobs",
    "Search for job listings. Fetches remote jobs from Remotive.io and Finnish jobs from Indeed. Returns up to 8 results with title, company, location, URL, and description.",
    {
      keyword: z.string().optional().describe("Job search keyword (e.g. 'software engineer', 'data scientist')"),
      location: z.string().optional().default("Finland").describe("Location filter (default: Finland)"),
      remote: z.boolean().optional().default(false).describe("Include remote jobs from Remotive.io"),
    },
    async ({ keyword, location, remote }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = session.accessToken !== undefined ? { accessToken: session.accessToken } : {};
      return searchJobsHandler({ keyword, location, remote }, sessionArg);
    },
  );

  server.tool(
    "postArticle",
    "Post a long-form article to LinkedIn. Provide a title and body — the server formats it with hashtags and posts it. Articles live permanently on the profile and are indexed by Google.",
    {
      title: z.string().min(1).max(150).describe("Article headline"),
      body: z.string().min(50).max(2800).describe("Article body text"),
      topic: z.string().optional().describe("Topic hint for hashtags: ai, tech, startup, or future"),
      sourceUrl: z.string().url().optional().describe("Optional URL to share as article preview — enables rich link preview on the post"),
    },
    async ({ title, body, topic, sourceUrl }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      const sessionArg = {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      };
      return postArticleHandler({ title, body, topic, sourceUrl }, sessionArg);
    },
  );

  server.tool(
    "updateCompanyPage",
    "Update the OgeonX AI LinkedIn company page profile — sets the About description (English + Finnish), tagline (English + Finnish), specialties, and website URL via the LinkedIn API. Requires rw_organization_admin scope.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      return updateCompanyPageHandler({
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
      });
    },
  );

  // ── Company page tools (post as OgeonX AI LinkedIn page) ──────────────────

  server.tool(
    "postCompanyUpdate",
    "Post a text update to the OgeonX AI LinkedIn company page. Use this when the content represents the company brand, product announcements, or company news — not personal insights.",
    {
      text: z
        .string()
        .min(1, "Post text cannot be empty")
        .max(3000, "Post text cannot exceed LinkedIn's 3000-character limit")
        .describe("The text content of the LinkedIn post (1–3000 characters)"),
    },
    async ({ text }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      return postUpdateHandler({ text }, {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
        ...(config.linkedinOrgId !== undefined ? { orgId: config.linkedinOrgId } : {}),
      });
    },
  );

  server.tool(
    "postCompanyAINews",
    "Fetch a trending AI news headline and post it to the OgeonX AI company LinkedIn page. No parameters needed.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      return postAINewsHandler({}, {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
        ...(config.linkedinOrgId !== undefined ? { orgId: config.linkedinOrgId } : {}),
      });
    },
  );

  server.tool(
    "postCompanyThoughtLeadership",
    "Post a thought-leadership insight about AI trends to the OgeonX AI company LinkedIn page. Fetches a recent news item for context and composes an opinion-style post with a closing question.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      return postThoughtLeadershipHandler({}, {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
        ...(config.linkedinOrgId !== undefined ? { orgId: config.linkedinOrgId } : {}),
      });
    },
  );

  server.tool(
    "postCompanyWeeklyRoundup",
    "Post a weekly AI news roundup to the OgeonX AI company LinkedIn page — curates top 5 stories into a save-worthy summary. Best posted on Fridays.",
    {},
    async () => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      return postWeeklyRoundupHandler({}, {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
        ...(config.linkedinOrgId !== undefined ? { orgId: config.linkedinOrgId } : {}),
      });
    },
  );

  server.tool(
    "postCompanyArticle",
    "Post a long-form article to the OgeonX AI company LinkedIn page. Provide a title and body — formatted with hashtags and posted as the company.",
    {
      title: z.string().min(1).max(150).describe("Article headline"),
      body: z.string().min(50).max(2800).describe("Article body text"),
      topic: z.string().optional().describe("Topic hint for hashtags: ai, tech, startup, or future"),
      sourceUrl: z.string().url().optional().describe("Optional URL to share as article preview"),
    },
    async ({ title, body, topic, sourceUrl }) => {
      const session: Partial<SessionData> = sessionStore.get(sessionId) ?? {};
      return postArticleHandler({
        title,
        body,
        ...(topic !== undefined ? { topic } : {}),
        ...(sourceUrl !== undefined ? { sourceUrl } : {}),
      }, {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
        ...(config.linkedinOrgId !== undefined ? { orgId: config.linkedinOrgId } : {}),
      });
    },
  );

  return server;
}
