import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";

export const postUpdateSchema = {
  type: "object" as const,
  properties: {
    text: {
      type: "string" as const,
      description: "The text content of the LinkedIn post (max 3000 characters)",
    },
  },
  required: ["text"] as string[],
};

export async function postUpdateHandler(
  args: { text?: string },
  session: { accessToken?: string; linkedinSub?: string },
) {
  if (!session.accessToken || !session.linkedinSub) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Not authenticated. Visit /auth/login to connect LinkedIn.",
        },
      ],
    };
  }

  const text = args.text ?? "";

  // Validate before any API call (T-04-01, T-04-03, TOOLS-05)
  if (text.length === 0) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "Post text cannot be empty." }],
    };
  }

  if (text.length > 3000) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Post text exceeds LinkedIn's 3000-character limit (${text.length} characters).`,
        },
      ],
    };
  }

  // T-04-04: authorUrn comes from server-side session, never from client args
  const authorUrn = `urn:li:person:${session.linkedinSub}`;
  const client = new LinkedInClient();

  try {
    const post = await client.createPost(session.accessToken, authorUrn, text);
    return {
      isError: false,
      content: [
        {
          type: "text" as const,
          text: `Post created successfully.\nPost ID: ${post.postId}\nURL: ${post.postUrl}`,
        },
      ],
    };
  } catch (err) {
    const message =
      err instanceof LinkedInApiError ? err.message : "An unexpected error occurred.";
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}
