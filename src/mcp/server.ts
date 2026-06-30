import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "linkedin-mcp",
    version: "1.0.0",
  });

  // getProfile — stub implementation (MCP-04, MCP-05)
  // Real implementation: Phase 4 (TOOLS-01)
  server.tool(
    "getProfile",
    "Fetch the authenticated user's LinkedIn profile: name, email, headline, and sub (person ID).",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: "getProfile: not implemented yet. Complete LinkedIn OAuth in Phase 3 first.",
        },
      ],
    })
  );

  // postUpdate — stub implementation (MCP-04, MCP-05)
  // Real implementation: Phase 4 (TOOLS-02, TOOLS-05)
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
    async ({ text }) => ({
      content: [
        {
          type: "text" as const,
          text: `postUpdate: not implemented yet. Complete LinkedIn OAuth in Phase 3 first. (text preview: ${text.slice(0, 50)})`,
        },
      ],
    })
  );

  return server;
}
