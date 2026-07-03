/**
 * Fetch trending AI news from public RSS feeds and post one story to LinkedIn.
 * Uses free RSS feeds — no API keys needed.
 * Privacy-safe: only public news headlines, no company internals.
 */

import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";
import { recordPost } from "../analytics/post-history.js";

const NEWS_FEEDS = [
  "https://feeds.feedburner.com/oreilly/radar",           // O'Reilly Radar
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://www.technologyreview.com/feed/",
];

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

/** Minimal RSS parser — no dependencies, handles most well-formed RSS 2.0 feeds */
function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(block);
      return (m?.[1] ?? m?.[2] ?? "").trim();
    };
    const title = get("title");
    const link = get("link");
    const description = get("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300);
    const pubDate = get("pubDate");
    if (title && link) items.push({ title, link, description, pubDate });
  }
  return items;
}

async function fetchFeed(url: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "LinkedInMCP/1.0 RSS Reader" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRss(xml);
}

function composePost(item: NewsItem): string {
  const lines = [
    `🤖 AI News: ${item.title}`,
    "",
    item.description ? `${item.description.slice(0, 250)}...` : "",
    "",
    `📰 Read more: ${item.link}`,
    "",
    "#AI #ArtificialIntelligence #TechNews #MachineLearning",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  return lines.join("\n").slice(0, 3000);
}

function composePostCompany(item: NewsItem): string {
  const lines = [
    `🤖 OgeonX AI Daily: ${item.title}`,
    "",
    item.description ? `${item.description.slice(0, 220)}...` : "",
    "",
    `📰 Source: ${item.link}`,
    "",
    "---",
    "Follow OgeonX AI for daily AI news — curated and posted automatically.",
    "",
    "#OgeonXAI #AI #ArtificialIntelligence #TechNews #MachineLearning #LinkedInAutomation",
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  return lines.join("\n").slice(0, 3000);
}

export async function postAINewsHandler(
  _args: Record<string, unknown>,
  session: { accessToken?: string; linkedinSub?: string; orgId?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken || (!session.linkedinSub && !session.orgId)) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated. Visit /oauth/authorize to connect LinkedIn." }],
    };
  }

  // Try each feed until we get at least one item
  let items: NewsItem[] = [];
  for (const feed of NEWS_FEEDS) {
    try {
      items = await fetchFeed(feed);
      if (items.length > 0) break;
    } catch {
      // try next feed
    }
  }

  if (items.length === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: "Could not fetch AI news at this time. Try again later." }],
    };
  }

  // Pick the most recent item
  const item = items[0]!;
  const text = session.orgId ? composePostCompany(item) : composePost(item);
  const authorUrn = session.orgId
    ? `urn:li:organization:${session.orgId}`
    : `urn:li:person:${session.linkedinSub}`;

  const client = new LinkedInClient();
  try {
    const post = await client.createPost(session.accessToken, authorUrn, text);
    recordPost({
      type: "postAINews",
      target: session.orgId ? "company" : "personal",
      ownerSub: session.linkedinSub,
      text,
      linkedinPostId: post.postId,
      linkedinPostUrl: post.postUrl,
    });
    return {
      isError: false,
      content: [{
        type: "text",
        text: `✅ Posted AI news to LinkedIn!\n\nHeadline: ${item.title}\nPost ID: ${post.postId}\nURL: ${post.postUrl}`,
      }],
    };
  } catch (err) {
    const message = err instanceof LinkedInApiError ? err.message : "Unexpected error posting to LinkedIn.";
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }
}
