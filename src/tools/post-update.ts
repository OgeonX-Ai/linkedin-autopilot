import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";
import { recordPost } from "../analytics/post-history.js";

export async function postUpdateHandler(
  args: { text?: string },
  session: { accessToken?: string; linkedinSub?: string; orgId?: string },
) {
  if (!session.accessToken || (!session.linkedinSub && !session.orgId)) {
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
  const authorUrn = session.orgId
    ? `urn:li:organization:${session.orgId}`
    : `urn:li:person:${session.linkedinSub}`;
  const client = new LinkedInClient();

  try {
    const post = await client.createPost(session.accessToken, authorUrn, text);
    recordPost({
      type: "postUpdate",
      target: session.orgId ? "company" : "personal",
      ownerSub: session.linkedinSub,
      text,
      linkedinPostId: post.postId,
      linkedinPostUrl: post.postUrl,
    });
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
