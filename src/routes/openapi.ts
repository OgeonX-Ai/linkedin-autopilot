/**
 * OpenAPI 3.0 spec — served at GET /openapi.json
 * Used by Google Agentspace, Gemini, and any OpenAPI-compatible AI client
 * to discover available LinkedIn tools.
 */

import { Hono } from "hono";
import { config } from "../config.js";

export const openapiRoutes = new Hono();

openapiRoutes.get("/openapi.json", (c) => {
  const base = config.serverUrl || `http://localhost:${config.port}`;

  const spec = {
    openapi: "3.0.0",
    info: {
      title: "OgeonX LinkedIn Autopilot",
      version: "1.0.0",
      description: "Automate LinkedIn posting, job search, and content routines via AI agents.",
    },
    servers: [{ url: base }],
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Pre-shared API key (set API_KEYS in server .env)",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "JWT issued by GET /routine/token after LinkedIn OAuth",
        },
      },
    },
    paths: {
      "/routine/post-ai-news": {
        post: {
          operationId: "postAINews",
          summary: "Post trending AI news to LinkedIn",
          description: "Fetches the latest AI headline from RSS feeds and posts it to LinkedIn automatically.",
          responses: {
            "200": {
              description: "Post result",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RoutineResult" } } },
            },
          },
        },
      },
      "/routine/post-thought-leadership": {
        post: {
          operationId: "postThoughtLeadership",
          summary: "Post a Wednesday thought leadership insight",
          description: "Fetches an AI news item for context and composes an opinion-style post with a closing question to drive comments.",
          responses: {
            "200": {
              description: "Post result",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RoutineResult" } } },
            },
          },
        },
      },
      "/routine/post-weekly-roundup": {
        post: {
          operationId: "postWeeklyRoundup",
          summary: "Post a Friday weekly AI roundup",
          description: "Curates top 5 AI stories from multiple sources into a save-worthy summary post.",
          responses: {
            "200": {
              description: "Post result",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RoutineResult" } } },
            },
          },
        },
      },
      "/routine/post-article": {
        post: {
          operationId: "postArticle",
          summary: "Post a long-form article to LinkedIn",
          description: "Formats and posts a long-form article. Optionally attaches a URL for a rich link preview.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "body"],
                  properties: {
                    title: { type: "string", description: "Article headline" },
                    body: { type: "string", description: "Article body text" },
                    topic: { type: "string", enum: ["ai", "tech", "startup", "future"], description: "Topic for hashtag selection" },
                    sourceUrl: { type: "string", format: "uri", description: "URL to share as rich link preview" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Post result",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RoutineResult" } } },
            },
          },
        },
      },
      "/routine/search-jobs": {
        post: {
          operationId: "searchJobs",
          summary: "Search for job listings",
          description: "Searches Finnish jobs via Indeed and remote jobs via Remotive. Returns up to 8 results.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    keyword: { type: "string", description: "Job search keyword" },
                    location: { type: "string", default: "Finland", description: "Location filter" },
                    remote: { type: "boolean", default: false, description: "Include remote jobs" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Job search results",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RoutineResult" } } },
            },
          },
        },
      },
      "/routine/token": {
        get: {
          operationId: "getToken",
          summary: "Get a 30-day JWT for scheduled routines",
          description: "Requires browser session cookie from /auth/login. Returns a JWT to use as Bearer token.",
          security: [],
          responses: {
            "200": {
              description: "JWT token",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token: { type: "string" },
                      expires_in_days: { type: "number" },
                      linkedinSub: { type: "string" },
                      linkedinName: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "x-components": {
      schemas: {
        RoutineResult: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            message: { type: "string" },
          },
        },
      },
    },
  };

  return c.json(spec);
});
