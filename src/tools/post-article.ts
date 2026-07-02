/**
 * Post a LinkedIn Article (long-form) via the UGC Posts API.
 * Articles are indexed by Google and live permanently on the profile.
 *
 * LinkedIn Articles via API use shareCommentary as the "hook" text shown in feed,
 * with the article body embedded as a URL share pointing to an external canonical URL
 * OR as a native article via the /articles API (Partner only).
 *
 * Since the native /articles endpoint requires Partner access, we post a rich
 * "article-style" long-form post (3000 chars) which behaves like an article in the feed
 * and is the recommended approach for non-Partner apps.
 */

import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";
import { recordPost } from "../analytics/post-history.js";

export interface ArticleInput {
  title: string;
  body: string;    // Full article body — will be formatted and trimmed to 3000 chars
  topic?: string;  // Optional topic hint for hashtag generation
  sourceUrl?: string; // Optional URL to share as article preview (uses createArticlePost)
}

const TOPIC_HASHTAGS: Record<string, string[]> = {
  ai: ["#AI", "#ArtificialIntelligence", "#MachineLearning", "#GenerativeAI", "#LLM"],
  tech: ["#Technology", "#TechTrends", "#Innovation", "#DigitalTransformation"],
  startup: ["#Startup", "#Entrepreneurship", "#Innovation", "#Business"],
  future: ["#FutureOfWork", "#AI", "#Technology", "#Innovation"],
};

function pickHashtags(topic?: string): string {
  const key = topic?.toLowerCase() ?? "ai";
  const tags = TOPIC_HASHTAGS[key] ?? TOPIC_HASHTAGS["ai"]!;
  return tags.join(" ");
}

function formatArticle(input: ArticleInput): string {
  const hashtags = pickHashtags(input.topic);
  const sections = [
    `📝 ${input.title}`,
    "",
    input.body,
    "",
    "---",
    hashtags,
  ].join("\n");

  // Trim to LinkedIn's 3000-char limit
  if (sections.length <= 3000) return sections;
  const overflow = sections.length - 3000 + 4; // 4 for "...\n"
  return sections.slice(0, input.body.length - overflow) + "...\n\n---\n" + hashtags;
}

export async function postArticleHandler(
  args: { title?: string; body?: string; topic?: string; sourceUrl?: string },
  session: { accessToken?: string; linkedinSub?: string; orgId?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken || (!session.linkedinSub && !session.orgId)) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated. Visit /auth/login to connect LinkedIn." }],
    };
  }

  const title = (args.title ?? "").trim();
  const body = (args.body ?? "").trim();
  const sourceUrl = (args.sourceUrl ?? "").trim();

  if (!title || !body) {
    return {
      isError: true,
      content: [{ type: "text", text: "Both title and body are required for an article." }],
    };
  }

  const authorUrn = session.orgId
    ? `urn:li:organization:${session.orgId}`
    : `urn:li:person:${session.linkedinSub}`;
  const client = new LinkedInClient();

  try {
    let post;
    let textForHistory: string;
    if (sourceUrl) {
      // Use article preview (URL share) via createArticlePost
      const commentary = formatArticle({ title, body, topic: args.topic });
      post = await client.createArticlePost(
        session.accessToken,
        authorUrn,
        commentary,
        { source: sourceUrl, title, description: body.slice(0, 200) },
      );
      textForHistory = commentary;
    } else {
      // Fall back to long-form text post
      const text = formatArticle({ title, body, topic: args.topic });
      post = await client.createPost(session.accessToken, authorUrn, text);
      textForHistory = text;
    }
    recordPost({
      type: "postArticle",
      target: session.orgId ? "company" : "personal",
      ownerSub: session.linkedinSub,
      text: textForHistory,
      linkedinPostId: post.postId,
      linkedinPostUrl: post.postUrl,
    });
    return {
      isError: false,
      content: [{
        type: "text",
        text: `✅ Article posted to LinkedIn!\n\nTitle: ${title}\nPost ID: ${post.postId}\nURL: ${post.postUrl}`,
      }],
    };
  } catch (err) {
    const message = err instanceof LinkedInApiError ? err.message : "Unexpected error posting article.";
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
