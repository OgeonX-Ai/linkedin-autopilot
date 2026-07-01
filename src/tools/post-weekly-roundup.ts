/**
 * Post a weekly AI roundup — a curated summary of multiple news items.
 * Longer format, article-style, designed to be saved (highest engagement signal in 2026).
 * Posted on Fridays to catch the "end of week reflection" audience.
 */

import { LinkedInClient, LinkedInApiError } from "../linkedin/client.js";

const FEEDS = [
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://www.technologyreview.com/feed/",
  "https://feeds.feedburner.com/oreilly/radar",
];

interface NewsItem { title: string; description: string }

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const pattern = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = pattern.exec(xml)) !== null) {
    const block = m[1] ?? "";
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`).exec(block);
      return (r?.[1] ?? r?.[2] ?? "").trim();
    };
    const title = get("title");
    const description = get("description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120);
    if (title) items.push({ title, description });
  }
  return items.slice(0, 5);
}

async function fetchTopStories(): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "LinkedInMCP/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const items = parseRss(await res.text());
      all.push(...items.slice(0, 2)); // top 2 from each feed
      if (all.length >= 5) break;
    } catch { /* try next */ }
  }
  return all.slice(0, 5);
}

export async function postWeeklyRoundupHandler(
  _args: Record<string, unknown>,
  session: { accessToken?: string; linkedinSub?: string },
): Promise<{ isError: boolean; content: Array<{ type: "text"; text: string }> }> {
  if (!session.accessToken || !session.linkedinSub) {
    return {
      isError: true,
      content: [{ type: "text", text: "Not authenticated." }],
    };
  }

  const stories = await fetchTopStories();
  if (stories.length < 2) {
    return {
      isError: true,
      content: [{ type: "text", text: "Could not fetch enough stories for roundup. Try again later." }],
    };
  }

  const storyLines = stories.map((s, i) =>
    `${i + 1}. ${s.title}\n   ${s.description.slice(0, 100)}${s.description.length > 100 ? "..." : ""}`,
  ).join("\n\n");

  const text = [
    `🗓️ Weekly AI Roundup — What Mattered This Week`,
    ``,
    `Here are the stories shaping the AI landscape right now:`,
    ``,
    storyLines,
    ``,
    `---`,
    `The pace of change in AI is unlike anything we've seen in tech before.`,
    `Which of these stories do you think will have the biggest long-term impact?`,
    ``,
    `Save this post to review your AI news in one place. 📌`,
    ``,
    `#AI #WeeklyRoundup #ArtificialIntelligence #TechNews #Finland #Innovation #MachineLearning`,
  ].join("\n").slice(0, 3000);

  const authorUrn = `urn:li:person:${session.linkedinSub}`;
  const client = new LinkedInClient();

  try {
    const post = await client.createPost(session.accessToken, authorUrn, text);
    return {
      isError: false,
      content: [{
        type: "text",
        text: `✅ Weekly roundup posted!\n${stories.length} stories covered.\nURL: ${post.postUrl}`,
      }],
    };
  } catch (err) {
    const message = err instanceof LinkedInApiError ? err.message : "Unexpected error.";
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
