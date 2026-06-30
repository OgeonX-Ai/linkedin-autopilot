import type { MiddlewareHandler } from "hono";
import { config } from "../config.js";

export const authChallenge: MiddlewareHandler = async (c, next) => {
  await next();

  // After route handling: if the response is 401, append WWW-Authenticate
  // so the MCP client knows where to find the OAuth metadata (MCP-08)
  if (c.res.status === 401) {
    const metadataUrl = `${config.SERVER_URL}/.well-known/oauth-protected-resource`;
    c.res.headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${metadataUrl}"`
    );
  }
};
