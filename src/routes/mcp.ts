import { Hono } from "hono";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { buildMcpServer } from "../mcp/server.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpBindings } from "@hono/node-server";

export const mcpRoutes = new Hono<{ Bindings: HttpBindings }>();

// Both GET and POST /mcp are handled by the same Streamable HTTP transport
// GET opens a persistent SSE stream; POST handles JSON-RPC requests
// NodeJS req/res are accessed via c.env.incoming / c.env.outgoing (HttpBindings)
mcpRoutes.all("/mcp", async (c) => {
  const rawReq = c.env.incoming as IncomingMessage;
  const rawRes = c.env.outgoing as ServerResponse;

  if (!rawReq || !rawRes) {
    return c.json({ error: "Raw Node.js request context unavailable" }, 500);
  }

  // Stateless mode: omit sessionIdGenerator entirely (exactOptionalPropertyTypes-safe)
  const transport = new StreamableHTTPServerTransport({});

  const mcpServer = buildMcpServer();
  // Cast to Transport to satisfy exactOptionalPropertyTypes strictness on optional callbacks
  await mcpServer.connect(transport as unknown as Transport);

  let body: unknown;
  if (c.req.method === "POST") {
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
  }

  // transport.handleRequest writes the full response (headers + body) directly to rawRes.
  // We await it but do NOT return a Hono Response — returning one would cause a
  // "headers already sent" error because Hono would try to write response headers again.
  await transport.handleRequest(rawReq, rawRes, body);
  // eslint-disable-next-line consistent-return -- intentional: transport owns the response lifecycle
  return;
});
