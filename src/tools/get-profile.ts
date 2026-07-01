import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";

export async function getProfileHandler(
  _args: Record<string, unknown>,
  session: { accessToken?: string },
) {
  if (!session.accessToken) {
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

  const client = new LinkedInClient();
  try {
    const profile = await client.getProfile(session.accessToken);
    const text = [
      `Name: ${profile.name}`,
      `Email: ${profile.email}`,
      `Headline: ${profile.headline}`,
      `LinkedIn ID: ${profile.sub}`,
    ].join("\n");
    return {
      isError: false,
      content: [{ type: "text" as const, text }],
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
