import { getProfileHandler, getProfileSchema } from "../tools/get-profile.js";
import { postUpdateHandler, postUpdateSchema } from "../tools/post-update.js";
import type { SessionData } from "../auth/session.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  handler: (
    args: Record<string, unknown>,
    session: Partial<SessionData>,
  ) => Promise<{
    isError: boolean;
    content: Array<{ type: "text"; text: string }>;
  }>;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: "getProfile",
    description:
      "Fetch the authenticated user's LinkedIn profile (name, email, headline, LinkedIn ID).",
    inputSchema: getProfileSchema,
    handler: (args, session) =>
      getProfileHandler(
        args,
        session.accessToken !== undefined ? { accessToken: session.accessToken } : {},
      ),
  },
  {
    name: "postUpdate",
    description: "Post a text update to the authenticated user's LinkedIn feed.",
    inputSchema: postUpdateSchema,
    handler: (args, session) =>
      postUpdateHandler(args as { text?: string }, {
        ...(session.accessToken !== undefined ? { accessToken: session.accessToken } : {}),
        ...(session.linkedinSub !== undefined ? { linkedinSub: session.linkedinSub } : {}),
      }),
  },
];

export function getToolList() {
  return TOOL_REGISTRY.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}

export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  session: Partial<SessionData>,
) {
  const tool = TOOL_REGISTRY.find((t) => t.name === toolName);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Unknown tool: ${toolName}` }],
    };
  }
  return tool.handler(args, session);
}
