import { Hono } from "hono";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { buildMcpServer } from "../mcp/server.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HttpBindings } from "@hono/node-server";
import { requireAuth } from "../middleware/require-auth.js";

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

  let body: unknown;
  if (c.req.method === "POST") {
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
  }

  // Gate tools/call requests behind a valid LinkedIn session (Phase 3 — requireAuth).
  // Non-POST and non-tools/call requests (e.g. initialize, GET SSE) are not gated.
  const isToolsCall =
    c.req.method === "POST" &&
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>)["method"] === "tools/call";

  if (isToolsCall) {
    // Cache parsed body so requireAuth helper can read the JSON-RPC id
    c.set("body" as never, body);

    let authPassed = false;
    const authResponse = await requireAuth(c, async () => {
      authPassed = true;
    });
    if (!authPassed) {
      // requireAuth returned a JSON-RPC -32001 response — return it directly
      return authResponse ?? c.res;
    }
  }

  // Stateless mode: omit sessionIdGenerator entirely (exactOptionalPropertyTypes-safe)
  const transport = new StreamableHTTPServerTransport({});

  const mcpServer = buildMcpServer();
  // Cast to Transport to satisfy exactOptionalPropertyTypes strictness on optional callbacks
  await mcpServer.connect(transport as unknown as Transport);

  // transport.handleRequest writes the full response (headers + body) directly to rawRes.
  // We await it but do NOT return a Hono Response — returning one would cause a
  // "headers already sent" error because Hono would try to write response headers again.
  await transport.handleRequest(rawReq, rawRes, body);
  // eslint-disable-next-line consistent-return -- intentional: transport owns the response lifecycle
  return;
});
