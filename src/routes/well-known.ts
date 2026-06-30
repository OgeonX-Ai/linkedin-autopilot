import { Hono } from "hono";
import { config } from "../config.js";

export const wellKnownRoutes = new Hono();

// MCP-07: OAuth Protected Resource Metadata
// Spec: https://www.ietf.org/archive/id/draft-ietf-oauth-resource-metadata-08.txt
// ChatGPT uses this endpoint to discover auth requirements before connecting
wellKnownRoutes.get("/oauth-protected-resource", (c) => {
  return c.json({
    resource: config.SERVER_URL,
    authorization_servers: ["https://www.linkedin.com/oauth"],
  });
});
