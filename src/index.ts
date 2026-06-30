import { config } from "./config.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(
      `[server] LinkedIn MCP server running on http://localhost:${info.port}`
    );
  }
);

export default app;
