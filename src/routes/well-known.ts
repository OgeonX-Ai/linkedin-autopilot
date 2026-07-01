import { Hono } from "hono";
import { config } from "../config.js";

export const wellKnownRoutes = new Hono();

// MCP-07: OAuth Protected Resource Metadata
wellKnownRoutes.get("/oauth-protected-resource", (c) => {
  return c.json({
    resource: config.SERVER_URL,
    authorization_servers: [config.SERVER_URL],
  });
});

// OAuth 2.0 Authorization Server Metadata (RFC 8414)
// ChatGPT fetches this to discover authorize + token endpoints
wellKnownRoutes.get("/oauth-authorization-server", (c) => {
  return c.json({
    issuer: config.SERVER_URL,
    authorization_endpoint: `${config.SERVER_URL}/oauth/authorize`,
    token_endpoint: `${config.SERVER_URL}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: [],
  });
});
